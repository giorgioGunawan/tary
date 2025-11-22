// AI Service for interpreting user requests and managing calendar operations
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Parse user's natural language request and determine the calendar action
 * @param {string} userMessage - The user's message
 * @returns {Object} - Parsed action with type and parameters
 */
async function parseCalendarIntent(userMessage) {
  try {
    console.log(`[AI] Parsing user intent: "${userMessage}"`);
    
    const systemPrompt = `You are a calendar assistant that interprets user requests and converts them into structured calendar operations.

Your job is to analyze the user's message and respond with a JSON object containing:
- action: One of ["read_events", "create_event", "update_event", "delete_event", "unknown"]
- parameters: An object with relevant parameters for the action

For "read_events":
- date: ISO date string or null for "today"
- dateRange: "day", "week", "month", or null
- specificDay: day name like "monday", "friday", etc.

For "create_event":
- summary: Event title/description
- location: Event location (if mentioned)
- startDateTime: ISO datetime string
- endDateTime: ISO datetime string (infer 1 hour if not specified)
- description: Additional details

For "update_event":
- searchQuery: Keywords to find the event
- updates: Object with fields to update (summary, location, startDateTime, endDateTime, description)

For "delete_event":
- searchQuery: Keywords to find the event to delete

Date/time parsing rules:
- "today" = current date
- "tomorrow" = current date + 1
- "friday", "monday", etc. = next occurrence of that day
- "next friday" = next week's friday
- "2pm", "14:00" = today at that time
- "friday 2pm" = next friday at 2pm
- "thursday at 2pm" = next thursday at 2pm

Current date for reference: ${new Date().toISOString().split('T')[0]}
Current time for reference: ${new Date().toTimeString().split(' ')[0]}

Examples:

User: "what do I have on friday?"
Response: {"action": "read_events", "parameters": {"specificDay": "friday", "dateRange": "day"}}

User: "show me my calendar for next week"
Response: {"action": "read_events", "parameters": {"dateRange": "week"}}

User: "schedule a fitness class at surry hills on thursday 2pm"
Response: {"action": "create_event", "parameters": {"summary": "Fitness class", "location": "Surry Hills", "startDateTime": "2024-11-28T14:00:00", "endDateTime": "2024-11-28T15:00:00"}}

User: "book me a meeting with john tomorrow at 10am for 30 minutes"
Response: {"action": "create_event", "parameters": {"summary": "Meeting with John", "startDateTime": "2024-11-23T10:00:00", "endDateTime": "2024-11-23T10:30:00"}}

User: "move my fitness class to 3pm"
Response: {"action": "update_event", "parameters": {"searchQuery": "fitness class", "updates": {"startDateTime": "15:00"}}}

User: "cancel my meeting with john"
Response: {"action": "delete_event", "parameters": {"searchQuery": "meeting with john"}}

Respond ONLY with valid JSON, no additional text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0].message.content.trim();
    console.log(`[AI] Raw response: ${content}`);
    
    // Parse JSON response
    const parsed = JSON.parse(content);
    console.log(`[AI] Parsed intent:`, JSON.stringify(parsed, null, 2));
    
    return parsed;
  } catch (error) {
    console.error('[AI] Error parsing intent:', error);
    return {
      action: 'unknown',
      parameters: {},
      error: error.message
    };
  }
}

/**
 * Generate a natural language response for calendar operations
 * @param {string} action - The action performed
 * @param {Object} result - The result of the operation
 * @param {Object} parameters - The parameters used
 * @returns {string} - Human-friendly response
 */
async function generateResponse(action, result, parameters) {
  try {
    console.log(`[AI] Generating response for action: ${action}`);
    
    const systemPrompt = `You are a friendly calendar assistant. Generate a concise, natural response based on the calendar operation performed.

Keep responses brief and friendly. Use emojis sparingly (📅 for calendar, ✅ for success, ❌ for errors).

For read_events: Summarize the events in a clear list format.
For create_event: Confirm what was created with key details.
For update_event: Confirm what was changed.
For delete_event: Confirm what was deleted.
For errors: Explain what went wrong in a helpful way.`;

    const userPrompt = `Action: ${action}
Parameters: ${JSON.stringify(parameters)}
Result: ${JSON.stringify(result)}

Generate a user-friendly response.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const content = response.choices[0].message.content.trim();
    console.log(`[AI] Generated response: ${content}`);
    
    return content;
  } catch (error) {
    console.error('[AI] Error generating response:', error);
    // Fallback to simple response
    if (action === 'read_events' && result.events) {
      return `Found ${result.events.length} event(s).`;
    } else if (action === 'create_event' && result.success) {
      return `✅ Event created successfully!`;
    } else if (action === 'update_event' && result.success) {
      return `✅ Event updated successfully!`;
    } else if (action === 'delete_event' && result.success) {
      return `✅ Event deleted successfully!`;
    } else {
      return result.error || 'Something went wrong. Please try again.';
    }
  }
}

/**
 * Parse relative date/time strings into ISO datetime
 * @param {string} dateTimeStr - Natural language date/time
 * @param {string} timeStr - Optional time string
 * @returns {Date} - Parsed date object
 */
function parseDateTime(dateTimeStr, timeStr = null) {
  const now = new Date();
  const result = new Date(now);
  
  // Reset to start of day
  result.setHours(0, 0, 0, 0);
  
  // Handle relative days
  const lowerStr = dateTimeStr.toLowerCase();
  
  if (lowerStr.includes('today')) {
    // Keep current date
  } else if (lowerStr.includes('tomorrow')) {
    result.setDate(result.getDate() + 1);
  } else if (lowerStr.includes('monday')) {
    result.setDate(result.getDate() + ((1 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('tuesday')) {
    result.setDate(result.getDate() + ((2 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('wednesday')) {
    result.setDate(result.getDate() + ((3 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('thursday')) {
    result.setDate(result.getDate() + ((4 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('friday')) {
    result.setDate(result.getDate() + ((5 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('saturday')) {
    result.setDate(result.getDate() + ((6 + 7 - result.getDay()) % 7 || 7));
  } else if (lowerStr.includes('sunday')) {
    result.setDate(result.getDate() + ((7 - result.getDay()) % 7 || 7));
  }
  
  // Handle "next" modifier
  if (lowerStr.includes('next') && !lowerStr.includes('next week')) {
    result.setDate(result.getDate() + 7);
  }
  
  // Parse time if provided
  const timeToUse = timeStr || dateTimeStr;
  const timeMatch = timeToUse.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    
    result.setHours(hours, minutes, 0, 0);
  }
  
  return result;
}

module.exports = {
  parseCalendarIntent,
  generateResponse,
  parseDateTime
};

