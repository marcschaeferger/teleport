package joinv1

import (
	"context"
	"errors"
	"io"

	"github.com/gravitational/trace"
	"golang.org/x/sync/errgroup"
	grpc "google.golang.org/grpc"

	joinv1 "github.com/gravitational/teleport/api/gen/proto/go/teleport/join/v1"
	"github.com/gravitational/teleport/lib/join/messages"
)

type Service interface {
	Join(context.Context, chan<- messages.Request, <-chan messages.Response) error
}

type server struct {
	joinv1.UnsafeJoinServiceServer

	service Service
}

func RegisterJoinServiceServer(s grpc.ServiceRegistrar) error {
	joinv1.RegisterJoinServiceServer(s, &server{})
	return nil
}

func (s *server) Join(stream grpc.BidiStreamingServer[joinv1.JoinRequest, joinv1.JoinResponse]) error {
	requests := make(chan messages.Request)
	responses := make(chan messages.Response)

	g, ctx := errgroup.WithContext(stream.Context())
	g.Go(func() error {
		return trace.Wrap(s.service.Join(ctx, requests, responses))
	})
	g.Go(func() error {
		defer close(requests)
		for {
			req, err := stream.Recv()
			if errors.Is(err, io.EOF) {
				// The client called CloseSend on the stream, this is not an error.
				return nil
			}
			if err != nil {
				return trace.Wrap(err, "reading client request from stream")
			}

			msg, err := convertRequestToMessage(req)
			if err != nil {
				return trace.Wrap(err)
			}

			select {
			case <-ctx.Done():
				return ctx.Err()
			case requests <- msg:
			}
		}
	})
	g.Go(func() error {
		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case resp, ok := <-responses:
				if !ok {
					return nil
				}
				msg, err := convertResponseFromMessage(resp)
				if err != nil {
					return trace.Wrap(err)
				}
				if err := stream.Send(msg); err != nil {
					return trace.Wrap(err, "sending server response to stream")
				}
			}
		}
	})
	return trace.Wrap(g.Wait())
}
