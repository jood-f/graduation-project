# SolarSense Manual QA Test-Case Checklist

## Legend
- Priority: `P0` blocker, `P1` high, `P2` medium, `P3` low
- Severity: `S1` critical, `S2` major, `S3` minor, `S4` cosmetic
- Coverage:
  - `Implemented`: Feature exists and is testable now
  - `Partial`: Feature exists but workflow is incomplete/risky
  - `Not Implemented`: Feature not present in current codebase
  - `Deployment-Dependent`: Behavior depends on infra/runtime policies

## Execution File
- Checklist CSV: `qa/SolarSense_Manual_QA_Checklist.csv`

## CSV Columns
- `Module`
- `Test Case ID`
- `Test Case`
- `Priority`
- `Severity`
- `Preconditions`
- `Steps`
- `Expected Result`
- `Coverage`
- `Owner`
- `Result` (`Not Run`, `Pass`, `Fail`, `Blocked`, `N/A`)
- `Evidence Link`
- `Defect ID`
- `Notes`

## Run Instructions
1. Fill `Owner` for each row before execution.
2. Execute all `P0` rows first as release gate.
3. Mark `Result` and attach artifact links in `Evidence Link` (screenshots, logs, API traces).
4. For each `Fail`, create a defect and place ID in `Defect ID`.
5. Re-run failed cases after fixes and update evidence.

## Recommended Release Gate
1. All `P0` cases must be `Pass` or explicitly approved `N/A`.
2. No open `S1` defects.
3. No unresolved security blockers in `SEC-*` and `RBAC-*`.
4. Upload reliability cases (`IMG-002`, `ERR-002`) must have validated fallback behavior.

## Deliverables Checklist
- [ ] Test environment URL + build/version
- [ ] Test accounts for each role (Admin/Operator/Drone Team)
- [ ] Sample site with known telemetry + known anomalies
- [ ] Sample mission with known images (RGB + IR if supported)
- [ ] Expected KPI/threshold definitions
- [ ] Logging/audit access for verification
