// Calendar Handler - Processes AI intents and executes calendar operations
const { parseCalendarIntent, generateResponse, parseDateTime } = require('./aiService');

/**
 * Process a calendar-related message using AI
 * @param {string} userMessage - The user's message
 * @param {string} phoneNumber - User's phone number
 * @param {Object} calendarFunctions - Object containing calendar operation functions
 * @returns {Object} - Result with response text and success status
 */
async function processCalendarMessage(userMessage, phoneNumber, calendarFunctions) {
  try {
    console.log(`[CALENDAR_HANDLER] Processing message: "${userMessage}"`);
    
    // Parse intent using AI
    const intent = await parseCalendarIntent(userMessage);
    console.log(`[CALENDAR_HANDLER] Parsed intent:`, JSON.stringify(intent, null, 2));
    
    if (intent.action === 'unknown') {
      return {
        success: false,
        response: "I'm not sure what you'd like me to do with your calendar. Try asking me to:\n• Show your calendar (e.g., 'what do I have on Friday?')\n• Create an event (e.g., 'schedule a meeting tomorrow at 2pm')\n• Update an event (e.g., 'move my fitness class to 3pm')\n• Delete an event (e.g., 'cancel my dentist appointment')"
      };
    }
    
    let result;
    
    switch (intent.action) {
      case 'read_events':
        result = await handleReadEvents(phoneNumber, intent.parameters, calendarFunctions);
        break;
      
      case 'create_event':
        result = await handleCreateEvent(phoneNumber, intent.parameters, calendarFunctions);
        break;
      
      case 'update_event':
        result = await handleUpdateEvent(phoneNumber, intent.parameters, calendarFunctions);
        break;
      
      case 'delete_event':
        result = await handleDeleteEvent(phoneNumber, intent.parameters, calendarFunctions);
        break;
      
      default:
        result = {
          success: false,
          error: 'Unknown action'
        };
    }
    
    console.log(`[CALENDAR_HANDLER] Operation result:`, JSON.stringify(result, null, 2));
    
    // Generate natural language response
    const response = await generateResponse(intent.action, result, intent.parameters);
    
    return {
      success: result.success !== false,
      response: response
    };
    
  } catch (error) {
    console.error(`[CALENDAR_HANDLER] Error processing message:`, error);
    return {
      success: false,
      response: `Sorry, I encountered an error: ${error.message}`
    };
  }
}

/**
 * Handle read events request
 */
async function handleReadEvents(phoneNumber, parameters, calendarFunctions) {
  try {
    const { getCalendarEvents } = calendarFunctions;
    
    // Calculate date range
    let timeMin, timeMax;
    const now = new Date();
    
    if (parameters.specificDay) {
      // Get events for a specific day
      const targetDate = getNextDayOfWeek(parameters.specificDay);
      timeMin = new Date(targetDate);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(targetDate);
      timeMax.setHours(23, 59, 59, 999);
    } else if (parameters.dateRange === 'week') {
      // Get events for next 7 days
      timeMin = now;
      timeMax = new Date(now);
      timeMax.setDate(timeMax.getDate() + 7);
    } else if (parameters.dateRange === 'month') {
      // Get events for next 30 days
      timeMin = now;
      timeMax = new Date(now);
      timeMax.setDate(timeMax.getDate() + 30);
    } else {
      // Default: today's events
      timeMin = new Date(now);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(now);
      timeMax.setHours(23, 59, 59, 999);
    }
    
    console.log(`[CALENDAR_HANDLER] Fetching events from ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
    
    const events = await getCalendarEvents(
      phoneNumber,
      timeMin.toISOString(),
      timeMax.toISOString()
    );
    
    return {
      success: true,
      events: events,
      count: events ? events.length : 0
    };
  } catch (error) {
    console.error(`[CALENDAR_HANDLER] Error reading events:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle create event request
 */
async function handleCreateEvent(phoneNumber, parameters, calendarFunctions) {
  try {
    const { createCalendarEvent } = calendarFunctions;
    
    // Validate required parameters
    if (!parameters.summary) {
      return {
        success: false,
        error: 'Event title is required'
      };
    }
    
    if (!parameters.startDateTime) {
      return {
        success: false,
        error: 'Event start time is required'
      };
    }
    
    // Ensure endDateTime exists (default to 1 hour after start)
    if (!parameters.endDateTime) {
      const start = new Date(parameters.startDateTime);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      parameters.endDateTime = end.toISOString();
    }
    
    const eventDetails = {
      summary: parameters.summary,
      location: parameters.location || undefined,
      description: parameters.description || undefined,
      startDateTime: parameters.startDateTime,
      endDateTime: parameters.endDateTime
    };
    
    console.log(`[CALENDAR_HANDLER] Creating event:`, eventDetails);
    
    const result = await createCalendarEvent(phoneNumber, eventDetails);
    
    return result;
  } catch (error) {
    console.error(`[CALENDAR_HANDLER] Error creating event:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle update event request
 */
async function handleUpdateEvent(phoneNumber, parameters, calendarFunctions) {
  try {
    const { searchCalendarEvents, updateCalendarEvent } = calendarFunctions;
    
    // Search for the event
    if (!parameters.searchQuery) {
      return {
        success: false,
        error: 'Please specify which event to update'
      };
    }
    
    const matches = await searchCalendarEvents(phoneNumber, parameters.searchQuery);
    
    if (!matches || matches.length === 0) {
      return {
        success: false,
        error: `No events found matching "${parameters.searchQuery}"`
      };
    }
    
    // Use the first match
    const eventToUpdate = matches[0];
    console.log(`[CALENDAR_HANDLER] Updating event: ${eventToUpdate.id}`);
    
    const result = await updateCalendarEvent(
      phoneNumber,
      eventToUpdate.id,
      parameters.updates
    );
    
    return result;
  } catch (error) {
    console.error(`[CALENDAR_HANDLER] Error updating event:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle delete event request
 */
async function handleDeleteEvent(phoneNumber, parameters, calendarFunctions) {
  try {
    const { searchCalendarEvents, deleteCalendarEvent } = calendarFunctions;
    
    // Search for the event
    if (!parameters.searchQuery) {
      return {
        success: false,
        error: 'Please specify which event to delete'
      };
    }
    
    const matches = await searchCalendarEvents(phoneNumber, parameters.searchQuery);
    
    if (!matches || matches.length === 0) {
      return {
        success: false,
        error: `No events found matching "${parameters.searchQuery}"`
      };
    }
    
    // Use the first match
    const eventToDelete = matches[0];
    console.log(`[CALENDAR_HANDLER] Deleting event: ${eventToDelete.id} - ${eventToDelete.summary}`);
    
    const result = await deleteCalendarEvent(phoneNumber, eventToDelete.id);
    
    if (result.success) {
      result.deletedEvent = eventToDelete;
    }
    
    return result;
  } catch (error) {
    console.error(`[CALENDAR_HANDLER] Error deleting event:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get the next occurrence of a day of the week
 */
function getNextDayOfWeek(dayName) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(dayName.toLowerCase());
  
  if (targetDay === -1) {
    return new Date(); // Invalid day, return today
  }
  
  const today = new Date();
  const currentDay = today.getDay();
  
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7; // Next week
  }
  
  const result = new Date(today);
  result.setDate(result.getDate() + daysUntilTarget);
  
  return result;
}

module.exports = {
  processCalendarMessage
};

