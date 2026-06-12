#!/usr/bin/env bash
set -u

mkdir -p third_party

clone_or_update() {
  local name="$1"
  local url="$2"
  local dir="third_party/$name"
  echo "==> $name"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only && echo "OK updated $name" || echo "FAILED update $name"
  else
    git clone "$url" "$dir" && echo "OK cloned $name" || echo "FAILED clone $name"
  fi
}

clone_or_update "UniversalFakeDetect" "https://github.com/WisconsinAIVision/UniversalFakeDetect"
clone_or_update "DIRE" "https://github.com/ZhendongWang6/DIRE"
clone_or_update "aasist" "https://github.com/clovaai/aasist"
clone_or_update "MesoNet" "https://github.com/DariusAf/MesoNet"
clone_or_update "GenConViT" "https://github.com/erprogs/GenConViT"
clone_or_update "DeepfakeBench" "https://github.com/SCLBD/DeepfakeBench"

echo "Repo download pass complete. Optional failures above do not stop setup."
