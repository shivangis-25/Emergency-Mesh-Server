#!/bin/bash

BASE_URL="http://localhost:3000/api"

echo "------------------------------"
echo "Testing Messages API"
echo "------------------------------"

# POST a new message
curl -X POST "$BASE_URL/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg1",
    "text": "Test SOS message",
    "lat": 28.6139,
    "lon": 77.2090,
    "timestamp": 1699999999
  }'
echo -e "\n"

# GET all messages
curl -X GET "$BASE_URL/sync"
echo -e "\n\n"

echo "------------------------------"
echo "Testing Alerts API"
echo "------------------------------"

# POST a new alert
curl -X POST "$BASE_URL/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alert1",
    "userId": "user123",
    "type": "SOS",
    "message": "Help needed",
    "lat": 28.6139,
    "lon": 77.2090,
    "timestamp": 1699999999
  }'
echo -e "\n"

# GET all alerts
curl -X GET "$BASE_URL/alerts"
echo -e "\n"

# GET alert by ID
curl -X GET "$BASE_URL/alerts/alert1"
echo -e "\n"

# Update alert status
curl -X PUT "$BASE_URL/alerts/alert1" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}'
echo -e "\n"

# DELETE alert
# curl -X DELETE "$BASE_URL/alerts/alert1"
# echo -e "\n"

echo "------------------------------"
echo "Testing Contacts API"
echo "------------------------------"

# POST a new contact
curl -X POST "$BASE_URL/contacts" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "contact1",
    "userId": "user123",
    "name": "John Doe",
    "phone": "+911234567890"
  }'
echo -e "\n"

# GET user contacts
curl -X GET "$BASE_URL/contacts/user123"
echo -e "\n"

# DELETE contact
# curl -X DELETE "$BASE_URL/contacts/contact1"
# echo -e "\n"

echo "------------------------------"
echo "API Test Complete!"
echo "------------------------------"