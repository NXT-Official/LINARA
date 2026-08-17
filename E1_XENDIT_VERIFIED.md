Step 0.1
| helper_id                            | name              | phone       | payday_interval | monthly_rate | household_id                         | timezone    | household_today | cutoff_start | cutoff_end |
| ------------------------------------ | ----------------- | ----------- | --------------- | ------------ | ------------------------------------ | ----------- | --------------- | ------------ | ---------- |
| 5931e75a-61ca-4e19-9409-43f08def8cfd | Smoke Test Helper | 09171234567 | semi_monthly    | 8000.00      | 6b3b2244-2d37-4ca5-81c5-1e72bc81fb87 | Asia/Manila | 2026-08-17      | 2026-08-16   | 2026-08-31 |
| e13ecc26-8d47-4bd6-b887-6406e594247d | Ate Marites       | 09165563207 | semi_monthly    | 9000.00      | 15105f72-c91d-4ce2-9512-5da84634a865 | Asia/Manila | 2026-08-17      | 2026-08-16   | 2026-08-31 |
| 61c73ec7-9512-4805-8733-885d973be916 | Kuya Marito       | 09565563333 | semi_monthly    | 12000.00     | 15105f72-c91d-4ce2-9512-5da84634a865 | Asia/Manila | 2026-08-17      | 2026-08-16   | 2026-08-31 |

Step 0.2

Success. No rows returned

Step 0.3

| id                                   | helper_id                            | amount | status   | settled_in_payslip_id |
| ------------------------------------ | ------------------------------------ | ------ | -------- | --------------------- |
| 9a025f9f-bbff-4f13-98b6-4da727502967 | e13ecc26-8d47-4bd6-b887-6406e594247d | 500.00 | approved | null                  |

Step 0 - optional

| household_today |
| --------------- |
| 2026-08-17      |


Ref ID: e1-probe-20260817-123338

{
    "created": "2026-08-17T04:34:58.995Z",
    "business_id": "6a7e0ac4cfc187c11116173a",
    "event": "payout.succeeded",
    "data": {
        "id": "disb-acda3c97-57c1-4523-9d17-56ac6a550485",
        "amount": 100,
        "status": "SUCCEEDED",
        "created": "2026-08-17T04:33:38.428Z",
        "updated": "2026-08-17T04:34:58.816Z",
        "currency": "PHP",
        "description": "E1 probe",
        "channel_code": "PH_GCASH",
        "reference_id": "e1-probe-20260817-123338",
        "account_number": "09171234567",
        "idempotency_key": "e1-probe-20260817-123338",
        "channel_category": "EWALLET",
        "account_holder_name": "Test Kasambahay",
        "connector_reference": "SIMULATED_CONNECTOR_REFERENCE_1786941298582_4",
        "estimated_arrival_time": "2026-08-17T04:48:38.426Z"
    },
    "api_version": "v2"
}

Ref ID: e1-probe-fail-20260817-124437

{
    "created": "2026-08-17T04:48:13.129Z",
    "business_id": "6a7e0ac4cfc187c11116173a",
    "event": "payout.failed",
    "data": {
        "id": "disb-8111ec67-91f8-4e92-81ed-69d5a20987d9",
        "amount": 100,
        "status": "FAILED",
        "created": "2026-08-17T04:44:37.297Z",
        "updated": "2026-08-17T04:48:12.573Z",
        "currency": "PHP",
        "description": "E1 probe",
        "channel_code": "PH_GCASH",
        "failure_code": "TEMPORARY_TRANSFER_ERROR",
        "reference_id": "e1-probe-fail-20260817-124437",
        "account_number": "123456",
        "idempotency_key": "e1-probe-fail-20260817-124437",
        "channel_category": "EWALLET",
        "account_holder_name": "Test Kasambahay",
        "estimated_arrival_time": "2026-08-17T04:59:37.295Z"
    },
    "api_version": "v2"
}