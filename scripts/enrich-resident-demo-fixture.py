from pathlib import Path

path = Path('apps/resident/lib/data/demo_resident_repository.dart')
text = path.read_text()


def add(section_start: str, section_end: str, terminator: str, rows: list[str]) -> None:
    global text
    start = text.index(section_start)
    end = text.index(section_end, start)
    insert_at = text.rfind(terminator, start, end)
    if insert_at < 0:
        raise RuntimeError(f'Could not enrich section: {section_start}')
    payload = ''.join(rows)
    text = text[:insert_at] + payload + text[insert_at:]


add(
    "final List<Map<String, dynamic>> _access = [",
    "Future<List<Map<String, dynamic>>> households()",
    "  ];",
    [
        "    {'id': 'demo-access-7', 'unitId': 'demo-unit-1', 'subjectType': 'DELIVERY', 'subjectName': 'Flipkart Delivery', 'purpose': 'Electronics parcel', 'status': 'PENDING'},\n",
        "    {'id': 'demo-access-8', 'unitId': 'demo-unit-1', 'subjectType': 'CAB', 'subjectName': 'Uber - KA 03 MX 7812', 'purpose': 'Airport drop', 'status': 'APPROVED'},\n",
        "    {'id': 'demo-access-9', 'unitId': 'demo-unit-1', 'subjectType': 'SERVICE_PROVIDER', 'subjectName': 'CoolCare AC Technician', 'purpose': 'AC maintenance', 'status': 'CHECKED_OUT'},\n",
        "    {'id': 'demo-access-10', 'unitId': 'demo-unit-1', 'subjectType': 'VISITOR', 'subjectName': 'Priya Nair', 'purpose': 'Weekend visit', 'status': 'APPROVED'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> households() async => [",
    "Future<List<Map<String, dynamic>>> accessRequests()",
    "      ];",
    [
        "        {'id': 'demo-household-3', 'unitId': 'demo-unit-3', 'unitNumber': 'C-503', 'buildingName': 'Palm Tower', 'societyName': 'Aaraagate Demo Residency', 'occupancyRole': 'TENANT'},\n",
        "        {'id': 'demo-household-4', 'unitId': 'demo-unit-4', 'unitNumber': 'D-1502', 'buildingName': 'Oak Tower', 'societyName': 'Aaraagate Demo Residency', 'occupancyRole': 'OWNER'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> notices() async => [",
    "Stream<Map<String, dynamic>> accessEvents()",
    "      ];",
    [
        "        {'id': 'demo-notice-7', 'title': 'Clubhouse renovation update', 'body': 'The first-floor lounge reopens on 12 September.', 'audience': 'OWNER_AND_OCCUPANTS'},\n",
        "        {'id': 'demo-notice-8', 'title': 'Fire drill on Saturday', 'body': 'A safety drill will begin at 11:00 AM near Gate 2.', 'audience': 'OWNER_AND_OCCUPANTS'},\n",
        "        {'id': 'demo-notice-9', 'title': 'Vehicle sticker verification', 'body': 'Please verify registered vehicle stickers before 15 September.', 'audience': 'OWNER_AND_OCCUPANTS'},\n",
        "        {'id': 'demo-notice-10', 'title': 'AGM documents available', 'body': 'Owners can review the annual meeting documents in the society office.', 'audience': 'OWNER_ONLY'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> serviceCategories() async => [",
    "final List<Map<String, dynamic>> _offerings",
    "      ];",
    [
        "        {'id': 'demo-category-7', 'name': 'Pest control'},\n",
        "        {'id': 'demo-category-8', 'name': 'Car care'},\n",
    ],
)

add(
    "final List<Map<String, dynamic>> _offerings = const [",
    "Future<List<Map<String, dynamic>>> serviceOfferings",
    "  ];",
    [
        "    {'id': 'demo-offering-7', 'categoryId': 'demo-category-7', 'name': 'Cockroach treatment', 'description': 'Kitchen and bathroom pest-control service', 'price': 799},\n",
        "    {'id': 'demo-offering-8', 'categoryId': 'demo-category-8', 'name': 'Car interior cleaning', 'description': 'Vacuuming and interior detailing', 'price': 599},\n",
        "    {'id': 'demo-offering-9', 'categoryId': 'demo-category-1', 'name': 'Water purifier service', 'description': 'Filter inspection and routine servicing', 'price': 449},\n",
        "    {'id': 'demo-offering-10', 'categoryId': 'demo-category-5', 'name': 'Refrigerator inspection', 'description': 'Cooling and compressor diagnostic visit', 'price': 549},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> bookings() async => [",
    "Future<List<Map<String, dynamic>>> workforce()",
    "      ];",
    [
        "        {'id': 'demo-booking-5', 'offeringId': 'demo-offering-7', 'status': 'CONFIRMED', 'offering': {'name': 'Cockroach treatment'}},\n",
        "        {'id': 'demo-booking-6', 'offeringId': 'demo-offering-8', 'status': 'COMPLETED', 'offering': {'name': 'Car interior cleaning'}},\n",
        "        {'id': 'demo-booking-7', 'offeringId': 'demo-offering-9', 'status': 'REQUESTED', 'offering': {'name': 'Water purifier service'}},\n",
        "        {'id': 'demo-booking-8', 'offeringId': 'demo-offering-10', 'status': 'CONFIRMED', 'offering': {'name': 'Refrigerator inspection'}},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> workforce() async => [",
    "Future<List<Map<String, dynamic>>> workforceLeaves()",
    "      ];",
    [
        "        {'id': 'demo-workforce-6', 'assignmentId': 'demo-workforce-6', 'householdId': 'demo-household-1', 'name': 'Deepak', 'phone': '+919800000006', 'role': 'GARDENER', 'active': true},\n",
        "        {'id': 'demo-workforce-7', 'assignmentId': 'demo-workforce-7', 'householdId': 'demo-household-1', 'name': 'Meena', 'phone': '+919800000007', 'role': 'ELDER_CARE', 'active': true},\n",
        "        {'id': 'demo-workforce-8', 'assignmentId': 'demo-workforce-8', 'householdId': 'demo-household-1', 'name': 'Suresh', 'phone': '+919800000008', 'role': 'DOG_WALKER', 'active': true},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> workforceLeaves() async => [",
    "Future<List<Map<String, dynamic>>> workforceRatings()",
    "      ];",
    [
        "        {'id': 'demo-leave-3', 'assignmentId': 'demo-workforce-2', 'startsOn': '2026-09-18', 'endsOn': '2026-09-19', 'reason': 'Out of station', 'active': true},\n",
        "        {'id': 'demo-leave-4', 'assignmentId': 'demo-workforce-7', 'startsOn': '2026-09-22', 'endsOn': '2026-09-22', 'reason': 'Medical appointment', 'active': true},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> workforceRatings() async => [",
    "Future<List<Map<String, dynamic>>> helpdeskTickets()",
    "      ];",
    [
        "        {'assignmentId': 'demo-workforce-6', 'score': 5, 'comment': 'Keeps the balcony garden healthy'},\n",
        "        {'assignmentId': 'demo-workforce-7', 'score': 5, 'comment': 'Patient and dependable'},\n",
        "        {'assignmentId': 'demo-workforce-8', 'score': 4, 'comment': 'Very regular with timings'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> helpdeskTickets() async => [",
    "Future<List<Map<String, dynamic>>> maintenanceInvoices()",
    "      ];",
    [
        "        {'id': 'demo-ticket-5', 'unitId': 'demo-unit-1', 'title': 'Gym treadmill display issue', 'description': 'Display on treadmill 3 is not responding.', 'status': 'OPEN', 'priority': 'NORMAL'},\n",
        "        {'id': 'demo-ticket-6', 'unitId': 'demo-unit-1', 'title': 'Basement water accumulation', 'description': 'Small puddle near parking slot A-42 after heavy rain.', 'status': 'IN_PROGRESS', 'priority': 'HIGH'},\n",
        "        {'id': 'demo-ticket-7', 'unitId': 'demo-unit-1', 'title': 'Clubhouse booking clarification', 'description': 'Need confirmation on guest limit for birthday booking.', 'status': 'RESOLVED', 'priority': 'LOW'},\n",
        "        {'id': 'demo-ticket-8', 'unitId': 'demo-unit-1', 'title': 'Garbage pickup missed', 'description': 'Wet waste pickup was missed this morning.', 'status': 'CLOSED', 'priority': 'NORMAL'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> maintenanceInvoices() async => [",
    "Future<List<Map<String, dynamic>>> maintenancePayments()",
    "      ];",
    [
        "        {'id': 'demo-invoice-6', 'unitId': 'demo-unit-1', 'periodLabel': 'April 2026', 'amount': 4100, 'amountDue': 0, 'status': 'PAID'},\n",
        "        {'id': 'demo-invoice-7', 'unitId': 'demo-unit-1', 'periodLabel': 'March 2026', 'amount': 4100, 'amountDue': 0, 'status': 'PAID'},\n",
        "        {'id': 'demo-invoice-8', 'unitId': 'demo-unit-1', 'periodLabel': 'February 2026', 'amount': 3950, 'amountDue': 0, 'status': 'PAID'},\n",
        "        {'id': 'demo-invoice-9', 'unitId': 'demo-unit-1', 'periodLabel': 'January 2026', 'amount': 3950, 'amountDue': 0, 'status': 'PAID'},\n",
    ],
)

add(
    "Future<List<Map<String, dynamic>>> maintenancePayments() async => [",
    "Future<List<Map<String, dynamic>>> helpdeskActivities",
    "      ];",
    [
        "        {'id': 'demo-payment-5', 'invoiceId': 'demo-invoice-6', 'amount': 4100, 'status': 'SUCCESS', 'mode': 'UPI', 'paidAt': '2026-04-06T08:30:00Z'},\n",
        "        {'id': 'demo-payment-6', 'invoiceId': 'demo-invoice-7', 'amount': 4100, 'status': 'SUCCESS', 'mode': 'CARD', 'paidAt': '2026-03-05T12:20:00Z'},\n",
        "        {'id': 'demo-payment-7', 'invoiceId': 'demo-invoice-8', 'amount': 3950, 'status': 'SUCCESS', 'mode': 'UPI', 'paidAt': '2026-02-05T07:45:00Z'},\n",
        "        {'id': 'demo-payment-8', 'invoiceId': 'demo-invoice-9', 'amount': 3950, 'status': 'SUCCESS', 'mode': 'NET_BANKING', 'paidAt': '2026-01-07T10:10:00Z'},\n",
    ],
)

path.write_text(text)
print('Demo fixture enriched for APK packaging only.')
