#!/bin/bash

FLATC="$(dirname "$0")/../../backend/pkg/api/flatc_Linux_v24_3_25"

echo "Building JavaScript bindings."
rm -rf "./js"
"$FLATC" --ts --gen-all -o js/ berryhunter.fbs

echo "update the backend bindings by running 'go generate ./...' in backend/"

echo "Bindings updated."
