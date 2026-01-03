#!/usr/bin/env bash
# Example test script using curl to upload a file to the user chat upload endpoint
# Adjust URL, port, file path and auth token as needed.

URL="http://localhost:3300/api/users/USER_ID/upload"
TOKEN="Bearer REPLACE_WITH_TOKEN"
FILE_PATH="/path/to/test.jpg"

curl -v -X POST "$URL" \
  -H "Authorization: $TOKEN" \
  -F "upload=@${FILE_PATH}" \
  -o /tmp/upload-response.json

echo "Response saved to /tmp/upload-response.json"
