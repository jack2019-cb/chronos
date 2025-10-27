# Backend Genie Service Architecture (2025-10-27)

## System Overview

The Genie service implements a prompt-to-generation flow with robust persistence and deduplication. This document provides a comprehensive architectural overview and implementation status.

### Core Flow

```ascii
                                     ┌─────────────────┐
                                     │     Client      │
                                     └────────┬────────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           POST /prompt                               │
│                     Controller (server/index.js)                     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         GenieService                                 │
│                   (server/genieService.js)                           │
│                                                                      │
│    ┌─────────────────────┐         ┌───────────────────────┐         │
│    │  Generate Response  │───────▶│ Optional Persistence   │        │
│    └─────────────────────┘         └───────────────────────┘         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         SampleService                                │
│                   (server/sampleService.js)                          │
│                                                                      │
│    ┌─────────────────────┐         ┌───────────────────────┐         │
│    │  Content Building   │───────▶│    File Persistence   │         │
│    └─────────────────────┘         └───────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

## Implementation Status

### Completed Components

1. **Core Infrastructure**

   - Feature flag system (`GENIE_PERSISTENCE_ENABLED`)
   - Normalization utilities
   - Controller delegation to GenieService
   - Test scaffolding

2. **Database Architecture**
   - Prisma schema with `normalizedHash`/`normalizedText`
   - Migration scripts
   - Upsert implementation with test fallbacks
   - Multi-page envelope support

### Pending Verification

1. **High Priority**

   ```ascii
   ┌─────────────────┐
   │ Test Suite      │──▶ Full server tests with Postgres
   └─────────────────┘
           │
           ▼
   ┌─────────────────┐
   │ CI Integration  │──▶ Postgres concurrency validation
   └─────────────────┘
           │
           ▼
   ┌─────────────────┐
   │ Unit Tests      │──▶ dbUtils.createPrompt upsert behavior
   └─────────────────┘
   ```

2. **Pre-Production Tasks**
   ```ascii
   ┌─────────────────┐
   │ Data Migration  │──▶ Dedupe existing data (if any)
   └─────────────────┘
           │
           ▼
   ┌─────────────────┐
   │ Staging         │──▶ Enable feature flag + monitor
   └─────────────────┘
   ```

## Production Readiness Checklist

- [ ] Server test suite passing
- [ ] CI Postgres concurrency tests green
- [ ] Database deduplication verified
- [ ] Monitoring infrastructure in place
- [ ] Rollback plan documented

## Estimated Timeline

```ascii
                Today
                  ▼
Day 1 ─────┬─────┬─────┬─────┬─────┐
           │     │     │     │     │
    Tests  ├─────┤     │     │     │
           │     │     │     │     │
      CI   │     ├─────┤     │     │
           │     │     │     │     │
 Staging   │     │     ├─────┤     │
           │     │     │     │     │
 Monitor   │     │     │     ├─────┤
```

Total estimated effort: 4-12 hours active work + 3-6 hours monitoring

## Architecture Notes

### Key Components

1. **Controller Layer** (`server/index.js`)
   - Input validation
   - Service delegation
   - Response formatting

2. **Service Layer** (`server/genieService.js`)
   - Core generation logic
   - Persistence coordination
   - Response wrapping

3. **Business Layer** (`server/sampleService.js`)
   - Content generation
   - Mock implementations
   - File system interactions

4. **Utilities Layer**
   - Database operations (`dbUtils.js`)
   - File operations (`fileUtils.js`)
   - AI response formatting (`aiMockResponse.js`)

### Safety Considerations

1. **Development Environment**
   - Local SQLite fallbacks
   - Test-mode compatibility
   - Feature flag protection

2. **Production Safeguards**
   - Upsert-based deduplication
   - Normalized hash comparison
   - Non-blocking persistence
   - Staged rollout plan

## Next Steps

1. **Immediate Actions**
   - Initialize CI Postgres job
   - Add concurrency test suite
   - Complete unit test coverage

2. **Near-term Tasks**
   - Update documentation
   - Add structured logging
   - Implement metrics collection

3. **Future Considerations**
   - Performance monitoring
   - Scaling strategy
   - Backup procedures

---

_Last updated: October 27, 2025_
