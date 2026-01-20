// Teleport
// Copyright (C) 2026 Gravitational, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

package main

import (
	"go/ast"
	"slices"
	"strings"

	"github.com/gravitational/trace"
	"golang.org/x/tools/go/packages"
)

type Config struct {
	Patterns  []string
	BuildTags string
	Dir       string
	Excludes  []string
}

func Find(cfg Config) ([]string, error) {
	if len(cfg.Patterns) == 0 {
		cfg.Patterns = []string{"./..."}
	}

	pkgs, err := packages.Load(&packages.Config{
		Dir: cfg.Dir,
		Mode: packages.NeedName |
			packages.NeedFiles |
			packages.NeedSyntax,
		Tests:      true,
		BuildFlags: buildFlags(cfg.BuildTags),
	}, cfg.Patterns...)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	if packages.PrintErrors(pkgs) > 0 {
		return nil, trace.BadParameter("failed to load some packages")
	}

	seen := make(map[string]struct{})
	var result []string // Double allocate here for convience of preserving order. This doesn't need to be super efficient.

	// This could potentially be made faster if one was to drop `packages.NeedSyntax` and just scan raw files in parallel.
	// However, this is likely fast enough for most use cases.
	packages.Visit(pkgs, nil, func(p *packages.Package) {
		path := strings.TrimSuffix(p.PkgPath, ".test")
		path = strings.TrimSuffix(path, "_test")

		if matchesAnyPrefix(path, cfg.Excludes) {
			return
		}
		if hasBenchmark(p) {
			if _, ok := seen[path]; !ok {
				seen[path] = struct{}{}
				result = append(result, path)
			}
		}
	})

	return result, nil
}

func buildFlags(tags string) []string {
	if tags == "" {
		return nil
	}
	return []string{"-tags=" + tags}
}

func hasBenchmark(pkg *packages.Package) bool {
	return slices.ContainsFunc(pkg.Syntax, fileHasBenchmark)
}

func fileHasBenchmark(file *ast.File) bool {
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv != nil {
			continue
		}
		if isBenchmark(fn) {
			return true
		}
	}
	return false
}

func matchesAnyPrefix(path string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

func isBenchmark(fn *ast.FuncDecl) bool {
	if fn.Name == nil || !strings.HasPrefix(fn.Name.Name, "Benchmark") {
		return false
	}
	if fn.Type == nil || fn.Type.Params == nil {
		return false
	}

	params := fn.Type.Params.List
	if len(params) != 1 {
		return false
	}

	// Look for parameter of type *testing.B
	star, ok := params[0].Type.(*ast.StarExpr)
	if !ok {
		return false
	}
	sel, ok := star.X.(*ast.SelectorExpr)
	if !ok {
		return false
	}

	return sel.Sel.Name == "B"
}
