#!/bin/bash
cd "$(dirname "$0")/kototeka" || exit 1
python3 server.py
