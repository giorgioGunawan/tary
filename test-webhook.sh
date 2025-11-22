#!/bin/bash

# Test script for webhook endpoint
# Make sure your server is running first!

BASE_URL="http://localhost:3000"

echo "=== Testing Webhook Endpoint ==="
echo ""

# Get VERIFY_TOKEN from .env file
if [ -f .env ]; then
    VERIFY_TOKEN=$(grep VERIFY_TOKEN .env | cut -d '=' -f2)
    echo "Found VERIFY_TOKEN in .env file"
else
    echo "⚠️  No .env file found. Please set VERIFY_TOKEN manually:"
    read -p "Enter your VERIFY_TOKEN: " VERIFY_TOKEN
fi

echo ""
echo "1. Testing GET endpoint (Webhook Verification)..."
echo "   URL: $BASE_URL/?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=$VERIFY_TOKEN"
echo ""
RESPONSE=$(curl -s "$BASE_URL/?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=$VERIFY_TOKEN")
if [ "$RESPONSE" = "test123" ]; then
    echo "   ✅ SUCCESS: Webhook verification passed!"
    echo "   Response: $RESPONSE"
else
    echo "   ❌ FAILED: Expected 'test123', got '$RESPONSE'"
fi

echo ""
echo "2. Testing POST endpoint (Receiving Webhook with User Message)..."
echo "   Sending test webhook payload with user message..."
echo ""

# Check if META_ACCESS_TOKEN is set
if [ -f .env ]; then
    META_TOKEN=$(grep META_ACCESS_TOKEN .env | cut -d '=' -f2)
    if [ -z "$META_TOKEN" ]; then
        echo "   ⚠️  META_ACCESS_TOKEN not found in .env"
        echo "   The webhook will receive the message but won't be able to send a reply."
        echo "   To test replies, add META_ACCESS_TOKEN to your .env file"
        echo ""
    else
        echo "   ✅ META_ACCESS_TOKEN found - reply will be attempted"
        echo ""
    fi
fi

curl -X POST "$BASE_URL/" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "test_entry_id",
      "time": 1234567890,
      "messaging": [{
        "sender": {"id": "123456"},
        "recipient": {"id": "789012"},
        "timestamp": 1234567890,
        "message": {
          "mid": "test_message_id",
          "text": "Hello, this is a test webhook!"
        }
      }]
    }]
  }' -w "\n   Status: %{http_code}\n"

echo ""
echo "=== Check your server console for: ==="
echo "   - 📨 USER MESSAGE (received message)"
echo "   - 📤 Sending reply (attempt to send)"
echo "   - ✅ Message sent successfully (if META_ACCESS_TOKEN is valid)"
echo "   - ❌ Error messages (if token is missing/invalid)"

