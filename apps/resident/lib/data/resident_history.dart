class ResidentHistoryCursor {
  const ResidentHistoryCursor(this.timestamp, this.id);
  final String timestamp;
  final String id;
}

class ResidentHistoryPage {
  ResidentHistoryPage(List<Map<String, dynamic>> rows) : items = List.unmodifiable(rows.take(50)) {
    if (rows.length > 50 && items.isNotEmpty) {
      final last = items.last;
      final time = last['historyTimestamp']?.toString();
      final id = last['id']?.toString();
      if (time == null || id == null) throw StateError('History cursor is unavailable');
      next = ResidentHistoryCursor(time, id);
    }
  }
  final List<Map<String, dynamic>> items;
  ResidentHistoryCursor? next;
}

/// Local showcase/test data only; the live API performs filtering and paging.
List<Map<String, dynamic>> showcaseHistory(List<Map<String, dynamic>> rows, {String? unitId, String search = '', String? status, ResidentHistoryCursor? before}) {
  final result = rows.where((row) =>
    (unitId == null || row['unitId'] == unitId) &&
    (status == null || row['status'] == status) &&
    '${row['ticketNumber'] ?? ''} ${row['title'] ?? ''}'.toLowerCase().contains(search.toLowerCase())).map((row) => {
      ...row, 'historyTimestamp': row['historyTimestamp'] ?? row['createdAt'] ?? '2026-01-01T00:00:00.000000Z',
    }).toList();
  result.sort((a,b) {
    final time = b['historyTimestamp'].toString().compareTo(a['historyTimestamp'].toString());
    return time != 0 ? time : b['id'].toString().compareTo(a['id'].toString());
  });
  return result.where((row) => before == null || row['historyTimestamp'].toString().compareTo(before.timestamp) < 0 ||
    row['historyTimestamp'] == before.timestamp && row['id'].toString().compareTo(before.id) < 0).take(51).toList();
}
