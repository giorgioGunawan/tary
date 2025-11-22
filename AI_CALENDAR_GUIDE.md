# AI Calendar Assistant Guide

## Overview

Your WhatsApp bot now has an AI layer powered by GPT-3.5 Turbo that interprets natural language requests and automatically translates them into Google Calendar operations.

## Features

The AI assistant can:
- ✅ **Read/View calendar events** - Check what's on your calendar
- ✅ **Create new events** - Schedule meetings, appointments, and reminders
- ✅ **Update existing events** - Modify event details, times, or locations
- ✅ **Delete events** - Cancel appointments or meetings

## Setup

### 1. Environment Variables

Add the following to your `.env` file or Vercel environment variables:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Update Google Calendar Permissions

**IMPORTANT:** Users who already linked their calendar need to re-authorize with the new permissions.

The bot now requests these scopes:
- `https://www.googleapis.com/auth/calendar.events` (read/write events)
- `https://www.googleapis.com/auth/calendar.readonly` (read calendar)

To update:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project
3. The scopes are already updated in the code
4. Existing users will need to send `/link-calendar` again to re-authorize

## Usage Examples

### Viewing Calendar Events

**Natural language examples:**
- "What do I have on Friday?"
- "Show me my calendar for next week"
- "What's on my schedule today?"
- "Any events tomorrow?"
- "Show me next Monday's schedule"

**Response:**
The AI will fetch your events for the specified time period and display them in a friendly format.

---

### Creating Events

**Natural language examples:**
- "Schedule a fitness class at Surry Hills on Thursday 2pm"
- "Book me a meeting with John tomorrow at 10am for 30 minutes"
- "Add dentist appointment Friday at 3pm"
- "Create an event called Team Standup on Monday at 9am"
- "Schedule lunch with Sarah next Wednesday at 12:30pm"

**What the AI understands:**
- Event title/description
- Location (if mentioned)
- Date and time
- Duration (defaults to 1 hour if not specified)

---

### Updating Events

**Natural language examples:**
- "Move my fitness class to 3pm"
- "Change my dentist appointment to next week"
- "Update my meeting with John to 11am"
- "Reschedule my lunch to 1pm"

**How it works:**
1. AI searches for events matching your description
2. Updates the first matching event
3. Confirms what was changed

---

### Deleting Events

**Natural language examples:**
- "Cancel my meeting with John"
- "Delete my dentist appointment"
- "Remove the fitness class"
- "Cancel tomorrow's standup"

**How it works:**
1. AI searches for events matching your description
2. Deletes the first matching event
3. Confirms what was deleted

---

## Date/Time Parsing

The AI understands various date and time formats:

### Relative Dates
- "today", "tomorrow"
- "Friday", "next Monday", "Thursday"
- "next week", "this month"

### Times
- "2pm", "14:00", "3:30pm"
- "at 10am", "at 2:30 in the afternoon"

### Combined
- "Friday at 2pm"
- "next Thursday 3:30pm"
- "tomorrow morning at 9"

---

## Special Commands

### Link Calendar
Send one of these to connect your Google Calendar:
- `/link-calendar`
- `link calendar`

You'll receive a link to authorize the bot to access your calendar.

---

## Technical Architecture

### Modules

1. **`aiService.js`** - GPT-3.5 Turbo integration
   - Parses user intent from natural language
   - Generates friendly responses
   - Date/time parsing utilities

2. **`calendarHandler.js`** - Calendar operation orchestration
   - Routes AI intents to appropriate calendar functions
   - Handles search, create, update, delete operations
   - Date range calculations

3. **`app.js`** - Main application (updated)
   - New calendar functions: `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `searchCalendarEvents`
   - Enhanced `getCalendarEvents` with date range filtering
   - AI-powered webhook message handler

### Flow Diagram

```
User Message (WhatsApp)
    ↓
Webhook Endpoint (app.js)
    ↓
Is it /link-calendar? 
    → Yes: Generate OAuth URL
    → No: ↓
Check if calendar linked?
    → No: Ask user to link calendar
    → Yes: ↓
AI Service (parseCalendarIntent)
    ↓
Calendar Handler (processCalendarMessage)
    ↓
Execute Calendar Operation (read/create/update/delete)
    ↓
AI Service (generateResponse)
    ↓
Send WhatsApp Message
```

---

## API Cost Considerations

### OpenAI API Costs (GPT-3.5 Turbo)

Each user message makes **2 API calls**:
1. **Intent parsing** (~500 tokens max)
2. **Response generation** (~300 tokens max)

**Estimated costs:**
- Input: $0.50 per 1M tokens
- Output: $1.50 per 1M tokens
- Average message: ~$0.001 - $0.002 per message

**For 1000 messages/month:** ~$1-2

---

## Error Handling

The AI gracefully handles:
- ❌ Ambiguous requests → Asks for clarification
- ❌ Missing calendar connection → Prompts to link calendar
- ❌ Event not found → Informs user
- ❌ Invalid dates → Asks user to specify
- ❌ API errors → User-friendly error messages

---

## Customization

### Adjusting AI Behavior

Edit the system prompts in `aiService.js`:

**For intent parsing:**
```javascript
const systemPrompt = `You are a calendar assistant...`;
```

**For response generation:**
```javascript
const systemPrompt = `You are a friendly calendar assistant...`;
```

### Adding New Actions

1. Add new action type to `parseCalendarIntent` system prompt
2. Implement handler in `calendarHandler.js`
3. Add switch case in `processCalendarMessage`

---

## Testing

### Manual Testing

1. Link your calendar: `/link-calendar`
2. Try various queries:
   ```
   What do I have on Friday?
   Schedule a test meeting tomorrow at 2pm
   Move my test meeting to 3pm
   Cancel my test meeting
   ```

### Debug Logs

The application logs all AI interactions:
- `[AI]` - AI service operations
- `[CALENDAR_HANDLER]` - Calendar operation handling
- `[DEBUG]` - Detailed operation logs

---

## Troubleshooting

### "Calendar not linked" message
- User needs to authorize with `/link-calendar`
- Check if user has valid tokens in storage

### AI not understanding requests
- Check OpenAI API key is set
- Review logs for API errors
- Check if request is too ambiguous

### Events not being created
- Verify Google Calendar scopes include `calendar.events`
- Check if date/time parsing is correct
- Review Google Calendar API quotas

### Token refresh errors
- Ensure refresh token is stored
- User may need to re-authorize

---

## Future Enhancements

Potential improvements:
- 🔮 Multi-event operations (e.g., "show all meetings with John")
- 🔮 Recurring events support
- 🔮 Calendar sharing and invites
- 🔮 Smart scheduling (find free slots)
- 🔮 Event reminders and notifications
- 🔮 Integration with other calendar services (Outlook, Apple Calendar)
- 🔮 Voice note support (WhatsApp voice → transcription → AI)

---

## Security Notes

- ✅ OAuth tokens are stored securely per user
- ✅ All API calls use authenticated endpoints
- ✅ User data is isolated by phone number
- ⚠️ Keep `OPENAI_API_KEY` secret
- ⚠️ Don't log user messages in production
- ⚠️ Consider rate limiting for API calls

---

## Support

For issues or questions:
1. Check debug logs in your deployment (Vercel logs)
2. Verify environment variables are set
3. Test with simple queries first
4. Review error messages for specific issues

---

**Built with ❤️ using GPT-3.5 Turbo, Google Calendar API, and WhatsApp Business API**

