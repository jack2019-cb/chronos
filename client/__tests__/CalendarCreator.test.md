# CalendarCreator.test.md

## Test Purpose

This unit test validates the business logic of the `CalendarCreator` component, including UI rendering, event addition, and month toggling.

## Mocking Philosophy

Mocks are used only for external dependencies (e.g., network calls if present). Internal logic, such as event input and month selection, is tested directly without superficial or excessive mocking.

## Actionables

- Renders the calendar creator UI.
- Simulates adding events and toggling months.
- Confirms correct updates to the calendar state.
- Avoids mocking internal state or UI logic.

## Hallmarks

- Tests real substance: event handling and month selection logic.
- Isolates only true external dependencies (none in this test).
- Runs quickly and deterministically.
