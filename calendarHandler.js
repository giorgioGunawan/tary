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
        response: "I'm not sure what you'd like me to do with your calendar. Try asking me to:\n\n- Show your calendar (e.g., what do I have on Friday?)\n- Create an event (e.g., schedule a meeting tomorrow at 2pm)\n- Update an event (e.g., move my fitness class to 3pm)\n- Delete an event (e.g., cancel my dentist appointment)"
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
    
    // Calculate date range - use Sydney timezone
    let timeMin, timeMax;
    const now = new Date();
    const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    
    if (parameters.date) {
      // Specific date provided by AI (e.g., "2024-11-24")
      const targetDate = new Date(parameters.date + 'T00:00:00');
      timeMin = new Date(targetDate);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(targetDate);
      timeMax.setHours(23, 59, 59, 999);
      console.log(`[CALENDAR_HANDLER] Fetching events for specific date: ${parameters.date}`);
    } else if (parameters.specificDay) {
      // Get events for a specific day of week
      const targetDate = getNextDayOfWeek(parameters.specificDay, sydneyNow);
      timeMin = new Date(targetDate);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(targetDate);
      timeMax.setHours(23, 59, 59, 999);
      console.log(`[CALENDAR_HANDLER] Fetching events for ${parameters.specificDay}: ${targetDate.toISOString().split('T')[0]}`);
    } else if (parameters.dateRange === 'week') {
      // Get events for next 7 days
      timeMin = sydneyNow;
      timeMax = new Date(sydneyNow);
      timeMax.setDate(timeMax.getDate() + 7);
    } else if (parameters.dateRange === 'month') {
      // Get events for next 30 days
      timeMin = sydneyNow;
      timeMax = new Date(sydneyNow);
      timeMax.setDate(timeMax.getDate() + 30);
    } else {
      // Default: today's events
      timeMin = new Date(sydneyNow);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(sydneyNow);
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
 * @param {string} dayName - Name of the day (e.g., "monday", "friday")
 * @param {Date} fromDate - Starting date (defaults to now in Sydney timezone)
 */
function getNextDayOfWeek(dayName, fromDate = null) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(dayName.toLowerCase());
  
  if (targetDay === -1) {
    console.error(`[CALENDAR_HANDLER] Invalid day name: ${dayName}`);
    return fromDate || new Date(); // Invalid day, return today
  }
  
  // Use provided date or current Sydney time
  const startDate = fromDate || new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const currentDay = startDate.getDay();
  
  console.log(`[CALENDAR_HANDLER] Finding next ${dayName} from ${startDate.toISOString().split('T')[0]} (current day: ${days[currentDay]})`);
  
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7; // Next week
  }
  
  const result = new Date(startDate);
  result.setDate(result.getDate() + daysUntilTarget);
  
  console.log(`[CALENDAR_HANDLER] Next ${dayName} is: ${result.toISOString().split('T')[0]}`);
  
  return result;
}

module.exports = {
  processCalendarMessage
};

