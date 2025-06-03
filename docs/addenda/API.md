# ChronosCraft AI API Documentation

## Calendar API

Base URL: `/calendar`

### Data Models

#### Calendar

```typescript
interface Calendar {
  id: string;
  year: number;
  selectedMonths: string[];
  events: CalendarEvent[];
  backgroundUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface CalendarEvent {
  date: string;
  title: string;
}
```

### Endpoints

#### GET /calendar

Returns all calendars and available months.

**Query Parameters:**

- `id` (optional): Get a specific calendar by ID

**Response:**

- Without ID:
  ```json
  {
    "calendars": Calendar[],
    "months": string[]
  }
  ```
- With ID:
  ```json
  Calendar
  ```

**Status Codes:**

- 200: Success
- 404: Calendar not found (when using ID)

#### POST /calendar

Create a new calendar.

**Request Body:**

```json
{
  "year": number,
  "selectedMonths": string[],
  "events"?: CalendarEvent[],
  "backgroundUrl"?: string
}
```

**Response:**

```json
Calendar
```

**Status Codes:**

- 201: Created
- 400: Bad Request (missing required fields)

#### PUT /calendar/:id

Update an existing calendar.

**URL Parameters:**

- `id`: Calendar ID

**Request Body:**

```json
{
  "year"?: number,
  "selectedMonths"?: string[],
  "events"?: CalendarEvent[],
  "backgroundUrl"?: string
}
```

**Response:**

```json
Calendar
```

**Status Codes:**

- 200: Success
- 404: Calendar not found

#### DELETE /calendar/:id

Delete a calendar.

**URL Parameters:**

- `id`: Calendar ID

**Response:** None

**Status Codes:**

- 204: No Content
- 404: Calendar not found

### Error Responses

All error responses follow this format:

```json
{
  "message": string
}
```

### Test Coverage

The API has comprehensive test coverage:

- Statements: 100%
- Branches: 84.21%
- Functions: 100%
- Lines: 100%

Tests include both success and error cases for all endpoints.

## Project Save/Load API

Base URL: `/project`

### Data Model

```typescript
interface Project {
  id?: string;
  name: string;
  calendar: {
    year: number;
    selectedMonths: string[];
    backgroundUrl?: string;
  };
  events: CalendarEvent[];
  settings: {
    theme?: string;
  };
}
```

### Endpoints

#### GET /project

List all projects

**Response:**

```json
[{
  "id": string,
  "name": string,
  "createdAt": string,
  "updatedAt": string
}]
```

#### GET /project/:id

Load a specific project

**Response:**

```json
{
  "name": string,
  "calendar": {
    "year": number,
    "selectedMonths": string[],
    "backgroundUrl"?: string
  },
  "events": CalendarEvent[],
  "settings": object
}
```

#### POST /project

Create a new project

**Request Body:**

```json
{
  "name": string,
  "calendar": {
    "year": number,
    "selectedMonths": string[],
    "backgroundUrl"?: string
  },
  "events": CalendarEvent[],
  "settings": object
}
```

**Response:**

```json
{
  "id": string
}
```

#### PUT /project/:id

Update an existing project

**Request Body:** Same as POST /project
**Response:** Same as POST /project

#### DELETE /project/:id

Delete a project

**Response:** 204 No Content

### Error Responses

All error responses follow this format:

```json
{
  "message": string
}
```

### Test Coverage

The Project API has comprehensive test coverage:

- Full CRUD operation testing
- Error handling for missing/invalid data
- Integration tests with database
- Edge cases (e.g., non-existent projects)

Test cases include:

- Project creation with validation
- Project loading and data integrity
- Project listing with metadata
- Project updates with verification
- Project deletion with cleanup
- Error responses for all endpoints

## GenAI Integration API (Planned)

Base URL: `/genai`

- Endpoints for GenAI-powered theme/styling will be documented here as implemented.

## PDF Export Utility (Frontend)

- The frontend provides a utility to export calendar data to PDF.
- See `client/src/app/utils/pdfExport.ts` for implementation details.
- Tests for this utility are in `client/__tests__/pdfExport.test.ts`.
