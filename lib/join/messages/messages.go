package messages

import (
	"time"
)

type Request interface {
	isRequest()
}

type embedRequest struct{}

func (embedRequest) isRequest() {}

type ClientInit struct {
	embedRequest

	JoinMethod              string
	TokenName               string
	NodeName                string
	Role                    string
	AdditionalPrincipals    []string
	DNSNames                []string
	PublicTLSKey            []byte
	PublicSSHKey            []byte
	Expires                 time.Time
	ProxySuppliedParameters *ProxySuppliedParameters
}

type ProxySuppliedParameters struct {
	RemoteAddr    string
	ClientVersion string
}

type Response interface {
	isResponse()
}

type embedResponse struct{}

func (embedResponse) isResponse() {}

type ServerInit struct {
	embedResponse

	JoinMethod string
}

type Result struct {
	embedResponse

	TLSCert    []byte
	TLSCACerts [][]byte
	SSHCert    []byte
	SSHCAKeys  [][]byte
	HostID     string
}
