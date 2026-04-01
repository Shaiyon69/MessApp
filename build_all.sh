#!/bin/bash

# Backward-compatible wrapper so existing commands keep working.
exec ./scripts/build_all.sh "$@"
