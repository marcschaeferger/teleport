package joinv1

import (
	"context"

	"github.com/gravitational/trace"
	"golang.org/x/sync/errgroup"

	joinv1 "github.com/gravitational/teleport/api/gen/proto/go/teleport/join/v1"
	"github.com/gravitational/teleport/lib/join/messages"
)

type Client struct {
	grpcClient joinv1.JoinServiceClient
}

func (c *Client) Join(ctx context.Context, requests <-chan messages.Request, responses chan<- messages.Response) error {
	// Make sure the gRPC stream gets cleaned up when this method returns.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	stream, err := c.grpcClient.Join(ctx)
	if err != nil {
		return trace.Wrap(err)
	}

	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		for {
			select {
			case <-ctx.Done():
				return trace.Wrap(ctx.Err())
			case req, ok := <-requests:
				if !ok {
					return nil
				}

				if err := stream.Send(); err != nil {
					return trace.Wrap(err)
				}
			}
		}
	})
}
