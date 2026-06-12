# Third Party Repositories

Run:

```bash
bash scripts/download_repos.sh
```

The script clones or updates:

- UniversalFakeDetect
- DIRE
- AASIST
- MesoNet
- DeepfakeBench

Optional repo failures do not stop setup. Missing repos or weights are reported as `unavailable` by model wrappers.
