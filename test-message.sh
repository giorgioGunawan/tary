#!/bin/bash

# Quick test script to send a test message webhook
# Usage: ./test-message.sh "Your test message here"

BASE_URL="http://localhost:3000"
MESSAGE="${1:-Hello, this is a test message!}"

echo "Sending test message: \"$MESSAGE\""
echo ""

curl -X POST "$BASE_URL/" \
  -H "Content-Type: application/json" \
  -d "{
    \"object\": \"instagram\",
    \"entry\": [{
      \"id\": \"test_entry_id\",
      \"time\": $(date +%s),
      \"messaging\": [{
        \"sender\": {\"id\": \"test_user_123\"},
        \"recipient\": {\"id\": \"test_page_456\"},
        \"timestamp\": $(date +%s),
        \"message\": {
          \"mid\": \"test_msg_$(date +%s)\",
          \"text\": \"$MESSAGE\"
        }
      }]
    }]
  }" -w "\n\nStatus: %{http_code}\n"

echo ""
echo "Check your server console for the reply attempt!"

