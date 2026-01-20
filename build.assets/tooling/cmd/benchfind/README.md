# benchfind

A CLI utility to discover modules with Benchmarks without compilation/linking. 


Example useage:

```sh
benchfind
benchfind ./internal/...
benchfind --tags=integration,linux
benchfind --exclude api
```