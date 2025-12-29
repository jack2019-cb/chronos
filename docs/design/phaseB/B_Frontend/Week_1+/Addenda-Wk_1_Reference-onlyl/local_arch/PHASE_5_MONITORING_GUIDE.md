# Phase 5: Batch Processing - Monitoring & Alerting Guide

**Purpose**: Guide for monitoring Phase 5 batch processing system in production  
**Audience**: DevOps, Engineering, Operations teams  
**Last Updated**: Phase 5.2 Complete

---

## 📊 Monitoring Overview

Phase 5 batch processing system provides real-time metrics across four key dimensions:

1. **Performance Metrics** - API efficiency, latency, throughput
2. **Reliability Metrics** - Error rates, recovery success, uptime
3. **Resource Metrics** - Memory, database connections, session count
4. **Quality Metrics** - Factuality scores, error categorization, batch success

---

## 🎯 Key Metrics Dashboard

### Real-Time Metrics Endpoints

All metrics accessible via REST API with 24-hour retention:

```bash
# Session report (detailed single session)
GET /api/metrics/report/:sessionId
Response: {
  sessionId, userId, generationType,
  structure: { apiCalls, duration, tokensUsed, cost },
  batches: { count, successCount, failureCount, avgDuration },
  individuals: { count, successCount, failureCount },
  fallbacks: { count, avgRecoveryTime },
  performance: { latency: { p50, p95, p99 }, avgDuration },
  quality: { factuality, errorRate, batchSuccessRate, degradationFlags }
}

# Trending metrics (7-day aggregation)
GET /api/metrics/trending
Response: [
  { timestamp, avgApiCalls, avgLatency, errorRate, sessionCount }
  // ... 7 days of daily aggregates
]

# Global statistics
GET /api/metrics/stats
Response: {
  totalSessions, totalApiCalls, totalDuration,
  avgApiReduction: "24%", avgLatency: "4.2s",
  errorRate: "1.2%", fallbackRate: "2%"
}

# Trigger cleanup (optional, normally runs automatically)
POST /api/metrics/cleanup
Response: { sessionsRemoved, timestamp }
```

### Dashboard Queries

#### 1. API Call Efficiency (Most Important KPI)

```sql
-- Real-time API call reduction
SELECT
  COUNT(*) as total_sessions,
  ROUND(AVG(CAST(metrics->>'totalApiCalls' AS NUMERIC)), 2) as avg_api_calls,
  CASE
    WHEN AVG(CAST(metrics->>'chapters' AS NUMERIC)) <= 5 THEN '< 25 calls baseline'
    WHEN AVG(CAST(metrics->>'chapters' AS NUMERIC)) <= 10 THEN '~33 calls baseline'
    ELSE '~44 calls baseline'
  END as baseline,
  ROUND(100 * (1 - AVG(CAST(metrics->>'totalApiCalls' AS NUMERIC)) /
    CASE
      WHEN AVG(CAST(metrics->>'chapters' AS NUMERIC)) <= 5 THEN 25
      WHEN AVG(CAST(metrics->>'chapters' AS NUMERIC)) <= 10 THEN 33
      ELSE 44
    END), 2) as reduction_percentage
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours';
```

**Expected Result**:

- 8-page ebooks: ~6 API calls (33% reduction)
- 15-page ebooks: ~11 API calls (31% reduction)
- Overall: 22-25% reduction vs sequential

**Alert Threshold**: If reduction < 20%, investigate batch processor

#### 2. Latency Performance

```sql
-- Latency percentiles by ebook size
SELECT
  CASE
    WHEN CAST(metrics->>'chapters' AS NUMERIC) <= 5 THEN 'small (≤5 ch)'
    WHEN CAST(metrics->>'chapters' AS NUMERIC) <= 10 THEN 'medium (6-10 ch)'
    ELSE 'large (>10 ch)'
  END as size_category,
  COUNT(*) as count,
  ROUND(MIN(CAST(performance->'latency'->>'p50' AS NUMERIC))::numeric, 3) as p50_min,
  ROUND(AVG(CAST(performance->'latency'->>'p50' AS NUMERIC))::numeric, 3) as p50_avg,
  ROUND(MAX(CAST(performance->'latency'->>'p50' AS NUMERIC))::numeric, 3) as p50_max,
  ROUND(MIN(CAST(performance->'latency'->>'p95' AS NUMERIC))::numeric, 3) as p95_min,
  ROUND(AVG(CAST(performance->'latency'->>'p95' AS NUMERIC))::numeric, 3) as p95_avg,
  ROUND(MAX(CAST(performance->'latency'->>'p95' AS NUMERIC))::numeric, 3) as p95_max,
  ROUND(MIN(CAST(performance->'latency'->>'p99' AS NUMERIC))::numeric, 3) as p99_min,
  ROUND(AVG(CAST(performance->'latency'->>'p99' AS NUMERIC))::numeric, 3) as p99_avg,
  ROUND(MAX(CAST(performance->'latency'->>'p99' AS NUMERIC))::numeric, 3) as p99_max
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY size_category
ORDER BY size_category;
```

**Baselines**:

- Small (≤5 chapters): p50 < 2s, p95 < 3s, p99 < 4s
- Medium (6-10 chapters): p50 < 3s, p95 < 5s, p99 < 7s
- Large (>10 chapters): p50 < 4s, p95 < 8s, p99 < 12s

**Alert Thresholds**:

- p95 > 5s for 5+ minutes → investigate database/AI service
- p99 > 15s → high variance, check network

#### 3. Error Rate & Recovery

```sql
-- Error tracking by type
SELECT
  errors->>'type' as error_type,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM "GeneratedMetrics"
    WHERE "createdAt" > NOW() - INTERVAL '24 hours'), 2) as percentage
FROM "GeneratedMetrics",
  jsonb_each_text(metrics->'errors') as errors
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY errors->>'type'
ORDER BY count DESC;

-- Fallback chapter usage
SELECT
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) as total_chapters,
  COUNT(*) FILTER (WHERE (metrics->>'fallbackCount')::int > 0) as fallback_chapters,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (metrics->>'fallbackCount')::int > 0) /
    COUNT(*), 2) as fallback_percentage,
  ROUND(AVG((metrics->>'fallbackCount')::int), 2) as avg_fallbacks_per_session
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Healthy Ranges**:

- Overall error rate: 1-2%
- Fallback rate: 1-3%
- Error breakdown: Network 40%, Timeout 30%, Rate-limit 20%, Parse 10%

**Alert Thresholds**:

- Error rate > 5% → severe issue, immediate investigation
- Fallback rate > 10% → batch processor malfunctioning
- Any single error type > 50% of total → specific issue (e.g., rate-limit quota)

#### 4. Batch Processing Efficiency

```sql
-- Batch success rates
SELECT
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) as total_batches,
  COUNT(*) FILTER (WHERE (batches->>'successCount')::int > 0) as successful_batches,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (batches->>'successCount')::int > 0) /
    COUNT(*), 2) as success_rate,
  ROUND(AVG((batches->>'avgDuration')::float), 2) as avg_batch_duration_ms
FROM "GeneratedMetrics",
  jsonb_array_elements(metrics->'batches') as batches
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Expected**: 95%+ batch success rate  
**Alert**: If < 90%, investigate batch processor

#### 5. Quality Metrics

```sql
-- Quality trends
SELECT
  DATE_TRUNC('day', "createdAt") as day,
  COUNT(*) as sessions,
  ROUND(AVG((quality->>'factuality')::float), 2) as avg_factuality,
  ROUND(AVG((quality->>'errorRate')::float), 2) as avg_error_rate,
  COUNT(*) FILTER (WHERE (metrics->>'fallbackCount')::int > 0) as sessions_with_fallbacks,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (metrics->>'fallbackCount')::int > 0) /
    COUNT(*), 2) as fallback_percentage
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY day
ORDER BY day DESC;
```

**Expected Ranges**:

- Factuality: 75-95%
- Error rate: 1-5%
- Fallback percentage: 1-3%

---

## 🚨 Alert Configuration

### Critical Alerts (Page on-call immediately)

1. **Error Rate Spike**

   ```
   Condition: error_rate > 10% for 5 consecutive minutes
   Severity: CRITICAL
   Action: Immediate investigation, consider rollback
   ```

2. **API Quota Exhaustion**

   ```
   Condition: API calls not decreasing (reduction < 15%) for 1 hour
   Severity: CRITICAL
   Action: Check batch processor, verify fallback not triggered
   ```

3. **Latency Degradation**

   ```
   Condition: p95 > 15s OR p99 > 30s for 10 consecutive minutes
   Severity: CRITICAL
   Action: Check database/AI service health, monitor resource usage
   ```

4. **Session Memory Leak**
   ```
   Condition: Session count not decreasing (TTL not working)
   Severity: CRITICAL
   Action: Restart METRICS singleton, check cleanup job
   ```

### Warning Alerts (Notify engineering team)

1. **Elevated Error Rate**

   ```
   Condition: error_rate > 5% for 15 minutes
   Severity: WARNING
   Action: Investigate error pattern, check error logs
   ```

2. **Fallback Usage Spike**

   ```
   Condition: fallback_rate > 5% for 30 minutes
   Severity: WARNING
   Action: Check batch processor health, monitor error types
   ```

3. **Latency Increase**

   ```
   Condition: p95 > 8s OR p99 > 12s for 15 minutes
   Severity: WARNING
   Action: Monitor trends, check for correlations with load
   ```

4. **Database Connection Issues**
   ```
   Condition: DB connections > 80% of pool for 5 minutes
   Severity: WARNING
   Action: Check query performance, consider connection pool increase
   ```

### Informational Alerts (Log and monitor)

1. **Session Cleanup Running**

   - Log: Sessions cleaned per hour
   - Target: 1-5 sessions cleaned per hour (normal TTL expiration)

2. **Performance Trending**

   - Log: Daily aggregate statistics
   - Track: API reduction %, latency trends, error rates

3. **Capacity Planning**
   - Metric: Peak concurrent sessions
   - Alert if trending upward: May need scaling

---

## 📈 Visualization & Dashboards

### Grafana Dashboard Setup

**Dashboard 1: Real-Time Performance**

```
Panels:
- API Call Efficiency (Gauge): Current reduction %, target 22-25%
- Latency Percentiles (Graph): p50, p95, p99 over time
- Error Rate (Gauge): Current error rate %, target < 2%
- Active Sessions (Stat): Current session count
```

**Dashboard 2: Reliability & Recovery**

```
Panels:
- Batch Success Rate (Gauge): % successful batches
- Fallback Usage (Timeseries): Fallback rate over time
- Error Type Breakdown (Pie): Distribution of error types
- Recovery Time (Stat): Avg time to recover from failure
```

**Dashboard 3: Resource Usage**

```
Panels:
- Memory Usage (Graph): METRICS singleton memory over time
- DB Connections (Gauge): Current connection count vs pool size
- Session Age Distribution (Histogram): TTL enforcement check
- Query Performance (Graph): DB query latency
```

**Dashboard 4: Quality Metrics**

```
Panels:
- Factuality Score (Gauge): Average factuality 0-100
- Error Rate by Type (Bar): Count by error type
- Batch vs Individual (Pie): % batched vs fallback chapters
- Daily Quality Trend (Line): Factuality and error rate over 7 days
```

### Query Templates

```prometheus
# API reduction (Prometheus)
(vector(33) - avg(api_calls_per_generation)) / vector(33) * 100

# Latency SLO (p95 < 5s)
histogram_quantile(0.95, rate(generation_latency_seconds_bucket[5m])) < 5

# Error rate SLO (< 2%)
(rate(generation_errors_total[5m]) / rate(generations_total[5m])) < 0.02

# Batch success (> 95%)
rate(batch_successes_total[1h]) / rate(batches_total[1h]) > 0.95
```

---

## 🔍 Troubleshooting Guide

### Symptom: Low API Call Reduction (< 15%)

**Possible Causes**:

1. Small ebooks being generated (no batching benefit)
2. Batch processor disabled/bypassed
3. High fallback rate (individual retries)

**Investigation**:

```sql
-- Check ebook size distribution
SELECT
  CASE
    WHEN CAST(metrics->>'chapters' AS NUMERIC) <= 5 THEN 'small'
    ELSE 'large'
  END as size,
  COUNT(*) as count
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY size;

-- Check if batches actually executing
SELECT
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE (batches->>'count')::int > 0) as sessions_with_batches
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours';
```

**Fix**:

- If mostly small books: Expected behavior, reduction low for < 5 chapters
- If batches not executing: Check logs for "batchProcessingOrchestrator" errors
- If high fallback: Check batch processor error types

### Symptom: High Latency (p95 > 5s consistently)

**Possible Causes**:

1. Database slow (query performance degraded)
2. AI service latency high (Google Gemini API)
3. Network issues between services
4. High concurrent load

**Investigation**:

```sql
-- Check latency by component
SELECT
  DATE_TRUNC('hour', "createdAt") as hour,
  ROUND(AVG((performance->'latency'->>'p95')::float), 2) as avg_p95,
  ROUND(AVG((structure->>'duration')::float), 2) as structure_duration,
  ROUND(AVG((batches->'avgDuration')::float), 2) as batch_avg_duration
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Check for load correlation
SELECT
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) as concurrent_sessions,
  ROUND(AVG((performance->'latency'->>'p95')::float), 2) as avg_p95
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Fix**:

- If structure duration > 2s: Database slow, check indexes/queries
- If batch_avg_duration high: AI service slow or network issues
- If load correlated: Consider scaling or connection pooling

### Symptom: High Fallback Rate (> 5%)

**Possible Causes**:

1. Batch processor errors (network, timeout)
2. AI model returning invalid JSON
3. Rate-limit hits triggering fallback
4. Memory pressure (partial batch failures)

**Investigation**:

```sql
-- Detailed fallback analysis
SELECT
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) FILTER (WHERE (metrics->>'fallbackCount')::int > 0) as fallback_sessions,
  COUNT(*) as total_sessions,
  jsonb_agg(DISTINCT metrics->'errors') as error_types,
  AVG((metrics->>'fallbackCount')::int) as avg_fallbacks
FROM "GeneratedMetrics"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Fix**:

- Check error types: Network → add retry logic
- Timeout → increase batch timeout or reduce batch size
- Rate-limit → cache responses or reduce concurrency
- Parse errors → check AI model response format

### Symptom: Memory Not Decreasing (Session TTL Not Working)

**Possible Causes**:

1. Cleanup job not running
2. Session references not being cleared
3. METRICS singleton not finalized

**Investigation**:

```bash
# Check process memory
ps aux | grep node
# Look for steadily increasing memory (RSS column)

# Check METRICS singleton
curl http://localhost:3000/api/metrics/stats | jq '.totalSessions'
# Should decrease over time (sessions expiring)
```

**Fix**:

```javascript
// Manually trigger cleanup
POST /api/metrics/cleanup

// Or restart service
pm2 restart server

// Or check cleanup interval in METRICS.js
// Should run every 24 hours
```

---

## 📋 Runbook Examples

### Responding to API Reduction Alert

```bash
# 1. Check current reduction
curl http://localhost:3000/api/metrics/stats | jq '.avgApiReduction'

# 2. Check session details
LATEST_SESSION=$(curl http://localhost:3000/api/metrics/trending | jq -r '.[0].sessionId')
curl http://localhost:3000/api/metrics/report/$LATEST_SESSION | jq '.structure'

# 3. Check if batches executing
tail -100 logs/server.log | grep -i "batch"

# 4. If batches not executing, check for errors
tail -100 logs/server.log | grep -i "error\|batch\|fallback"

# 5. If needed, restart batch processor
npm run restart:batch-processor

# 6. Monitor recovery
watch -n 5 'curl http://localhost:3000/api/metrics/stats | jq'
```

### Responding to High Error Rate Alert

```bash
# 1. Get error breakdown
curl http://localhost:3000/api/metrics/stats | jq '.errorBreakdown'

# 2. Check specific error type
tail -50 logs/server.log | grep -i "network_error\|timeout\|rate_limit"

# 3. If network errors: Check service connectivity
curl -I http://api.google.com/

# 4. If timeout errors: Check service response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health

# 5. If rate-limit: Check API quota
# Contact: Google Cloud Console → API quota

# 6. Escalate if needed
# Error rate > 10% for 30 minutes → page on-call engineer
```

### Responding to High Latency Alert

```bash
# 1. Check current latency
curl http://localhost:3000/api/metrics/stats | jq '.latencyPercentiles'

# 2. Check load
ps aux | grep node
# Look for CPU > 80% or memory > 80%

# 3. Check database
# Query performance from CloudSQL monitoring
# Look for slow queries or connection exhaustion

# 4. Check AI service
# Monitor Google Cloud Console → Gemini API quota

# 5. Possible fixes
# - Increase API quota
# - Optimize database queries
# - Scale services horizontally
# - Reduce batch size temporarily

# 6. Verify recovery
watch -n 5 'curl http://localhost:3000/api/metrics/stats | jq ".latencyPercentiles"'
```

---

## 📞 Escalation Matrix

| Scenario                   | Severity | Owner       | Escalation       |
| -------------------------- | -------- | ----------- | ---------------- |
| Error rate > 10% for 5 min | CRITICAL | On-Call     | VP Engineering   |
| API reduction < 15%        | HIGH     | Engineering | Tech Lead        |
| Latency p95 > 10s          | HIGH     | DevOps      | Engineering Lead |
| Fallback > 5% for 30 min   | MEDIUM   | Engineering | Tech Lead        |
| Memory > 500MB for 1 hour  | MEDIUM   | DevOps      | Engineering Lead |
| DB connection pool > 90%   | MEDIUM   | DevOps      | Database Team    |

---

## ✅ Pre-Deployment Monitoring Checklist

- [ ] Grafana dashboards created and tested
- [ ] Alert rules configured in monitoring system
- [ ] Escalation matrix shared with teams
- [ ] Runbooks accessible and reviewed
- [ ] On-call rotation configured
- [ ] Log aggregation working
- [ ] Metrics export verified
- [ ] Backup/restore procedures documented
- [ ] Team trained on dashboard and alerts

---

**Last Updated**: Phase 5.2  
**Next Review**: After 7 days of production monitoring
