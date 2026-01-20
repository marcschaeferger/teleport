/*
 * Teleport
 * Copyright (C) 2025  Gravitational, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package resources

import (
	"context"
	"fmt"
	"io"

	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/asciitable"
	"github.com/gravitational/teleport/lib/auth/authclient"
	"github.com/gravitational/teleport/lib/services"
	"github.com/gravitational/teleport/tool/common"
)

type kubeServerCollection struct {
	servers []types.KubeServer
}

// NewKubeServerCollection creates a [Collection] over the provided Kubernetes servers.
func NewKubeServerCollection(servers []types.KubeServer) Collection {
	return &kubeServerCollection{servers: servers}
}

func (c *kubeServerCollection) Resources() (r []types.Resource) {
	for _, resource := range c.servers {
		r = append(r, resource)
	}
	return r
}

func (c *kubeServerCollection) WriteText(w io.Writer, verbose bool) error {
	var rows [][]string
	for _, server := range c.servers {
		kube := server.GetCluster()
		if kube == nil {
			continue
		}
		labels := common.FormatLabels(kube.GetAllLabels(), verbose)
		rows = append(rows, []string{
			common.FormatResourceName(kube, verbose),
			labels,
			server.GetTeleportVersion(),
		})
	}

	headers := []string{"Cluster", "Labels", "Version"}
	var t asciitable.Table
	if verbose {
		t = asciitable.MakeTable(headers, rows...)
	} else {
		t = asciitable.MakeTableWithTruncatedColumn(headers, rows, "Labels")
	}
	// stable sort by cluster name.
	t.SortRowsBy([]int{0}, true)

	_, err := t.AsBuffer().WriteTo(w)
	return trace.Wrap(err)
}

func kubeServerHandler() Handler {
	return Handler{
		getHandler:    getKubeServer,
		createHandler: createKubeServer,
		updateHandler: updateKubeServer,
		deleteHandler: deleteKubeServer,
		singleton:     false,
		mfaRequired:   false,
		description:   "Represents a Kubernetes service in the cluster.",
	}
}

func getKubeServer(ctx context.Context, client *authclient.Client, ref services.Ref, opts GetOpts) (Collection, error) {
	servers, err := client.GetKubernetesServers(ctx)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	if ref.Name == "" {
		return &kubeServerCollection{servers: servers}, nil
	}

	// Filter by name or hostname
	altNameFn := func(r types.KubeServer) string {
		return r.GetHostname()
	}
	servers = FilterByNameOrDiscoveredName(servers, ref.Name, altNameFn)
	if len(servers) == 0 {
		return nil, trace.NotFound("Kubernetes server %q not found", ref.Name)
	}

	return &kubeServerCollection{servers: servers}, nil
}

func createKubeServer(ctx context.Context, client *authclient.Client, raw services.UnknownResource, opts CreateOpts) error {
	kubeServer, err := services.UnmarshalKubeServer(raw.Raw, services.DisallowUnknown())
	if err != nil {
		return trace.Wrap(err)
	}

	if _, err := client.UpsertKubernetesServer(ctx, kubeServer); err != nil {
		return trace.Wrap(err)
	}

	fmt.Printf("Kubernetes server %q has been upserted\n", kubeServer.GetName())
	return nil
}

func updateKubeServer(ctx context.Context, client *authclient.Client, raw services.UnknownResource, opts CreateOpts) error {
	kubeServer, err := services.UnmarshalKubeServer(raw.Raw, services.DisallowUnknown())
	if err != nil {
		return trace.Wrap(err)
	}

	// Check if server exists
	servers, err := client.GetKubernetesServers(ctx)
	if err != nil {
		return trace.Wrap(err)
	}

	altNameFn := func(r types.KubeServer) string {
		return r.GetHostname()
	}
	servers = FilterByNameOrDiscoveredName(servers, kubeServer.GetName(), altNameFn)
	if len(servers) == 0 {
		return trace.NotFound("Kubernetes server %q not found", kubeServer.GetName())
	}

	if _, err := client.UpsertKubernetesServer(ctx, kubeServer); err != nil {
		return trace.Wrap(err)
	}

	fmt.Printf("Kubernetes server %q has been updated\n", kubeServer.GetName())
	return nil
}

func deleteKubeServer(ctx context.Context, client *authclient.Client, ref services.Ref) error {
	servers, err := client.GetKubernetesServers(ctx)
	if err != nil {
		return trace.Wrap(err)
	}

	resDesc := "Kubernetes server"
	altNameFn := func(r types.KubeServer) string {
		return r.GetHostname()
	}
	servers = FilterByNameOrDiscoveredName(servers, ref.Name, altNameFn)
	name, err := GetOneResourceNameToDelete(servers, ref, resDesc)
	if err != nil {
		return trace.Wrap(err)
	}

	for _, s := range servers {
		if err := client.DeleteKubernetesServer(ctx, s.GetHostID(), name); err != nil {
			return trace.Wrap(err)
		}
	}

	fmt.Printf("%s %q has been deleted\n", resDesc, name)
	return nil
}
