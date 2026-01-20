package main

import (
	"fmt"
	"os"

	"github.com/alecthomas/kingpin/v2"
	"github.com/gravitational/trace"
)

func run() error {
	app := kingpin.New(
		"benchfind",
		"Find Go packages that define benchmarks without compiling tests.",
	)
	app.HelpFlag.Short('h')

	tags := app.Flag("tags", "Comma-separated build tags.").String()
	cwd := app.Flag(
		"cwd",
		"Working directory to run package discovery from. (Default: current directory)",
	).ExistingDir()
	patterns := app.Arg("patterns", "Package patterns. (Default: \"./...\")").Default("./...").Strings()
	excludes := app.Flag(
		"exclude",
		"Comma-separated list of path prefixes to skip (e.g., gen/, api/).",
	).Strings()
	kingpin.MustParse(app.Parse(os.Args[1:]))

	dir := *cwd
	if dir == "" {
		var err error
		dir, err = os.Getwd()
		if err != nil {
			return trace.Wrap(err, "failed to get current working directory")
		}
	}

	cfg := Config{
		Patterns:  *patterns,
		BuildTags: *tags,
		Dir:       dir,
		Excludes:  *excludes,
	}

	pkgs, err := Find(cfg)
	if err != nil {
		return trace.Wrap(err)
	}

	for _, p := range pkgs {
		fmt.Println(p)
	}

	return nil
}

func main() {
	if err := run(); err != nil {
		if trace.IsBadParameter(err) {
			fmt.Fprintln(os.Stderr, err.Error())
		} else {
			fmt.Fprintln(os.Stderr, trace.DebugReport(err))
		}
		os.Exit(1)
	}
}
