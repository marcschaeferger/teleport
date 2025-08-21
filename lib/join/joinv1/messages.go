package joinv1

import (
	"github.com/gravitational/trace"

	joinv1 "github.com/gravitational/teleport/api/gen/proto/go/teleport/join/v1"
	"github.com/gravitational/teleport/lib/join/messages"
)

func convertRequestToMessage(req *joinv1.JoinRequest) (messages.Request, error) {
	switch msg := req.GetPayload().(type) {
	case *joinv1.JoinRequest_ClientInit:
		return convertClientInitToMessage(msg.ClientInit), nil
	default:
		return nil, trace.BadParameter("unrecognized join request message type %T", msg)
	}
}

func convertClientInitToMessage(req *joinv1.ClientInit) *messages.ClientInit {
	msg := &messages.ClientInit{
		JoinMethod:           req.GetJoinMethod(),
		TokenName:            req.TokenName,
		NodeName:             req.NodeName,
		Role:                 req.Role,
		AdditionalPrincipals: req.AdditionalPrincipals,
		DNSNames:             req.DnsNames,
		PublicTLSKey:         req.PublicTlsKey,
		PublicSSHKey:         req.PublicSshKey,
		Expires:              req.GetExpires().AsTime(),
	}
	if proxySuppliedParams := req.GetProxySuppliedParameters(); proxySuppliedParams != nil {
		msg.ProxySuppliedParameters = &messages.ProxySuppliedParameters{
			RemoteAddr:    proxySuppliedParams.RemoteAddr,
			ClientVersion: proxySuppliedParams.ClientVersion,
		}
	}
	return msg
}

func convertResponseFromMessage(resp messages.Response) (*joinv1.JoinResponse, error) {
	switch msg := resp.(type) {
	case *messages.ServerInit:
		return &joinv1.JoinResponse{
			Payload: &joinv1.JoinResponse_Init{
				Init: convertServerInitFromMessage(msg),
			},
		}, nil
	case *messages.Result:
		return &joinv1.JoinResponse{
			Payload: &joinv1.JoinResponse_Result{
				Result: convertResultFromMessage(msg),
			},
		}, nil
	default:
		return nil, trace.BadParameter("unrecognized join response message type %T", msg)
	}
}

func convertServerInitFromMessage(msg *messages.ServerInit) *joinv1.ServerInit {
	return &joinv1.ServerInit{
		JoinMethod: msg.JoinMethod,
	}
}

func convertResultFromMessage(msg *messages.Result) *joinv1.Result {
	return &joinv1.Result{
		TlsCert:    msg.TLSCert,
		TlsCaCerts: msg.TLSCACerts,
		SshCert:    msg.TLSCert,
		SshCaKeys:  msg.SSHCAKeys,
		HostId:     msg.HostID,
	}
}
