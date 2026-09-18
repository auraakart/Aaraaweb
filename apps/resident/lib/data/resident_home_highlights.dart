enum ResidentHomeHighlightKind { billing, service, notice }

class ResidentHomeHighlight {
  const ResidentHomeHighlight({
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.priority,
  });

  final ResidentHomeHighlightKind kind;
  final String title;
  final String subtitle;
  final int priority;
}

class ResidentHomeHighlights {
  static List<ResidentHomeHighlight> build({
    required List<Map<String, dynamic>> invoices,
    required List<Map<String, dynamic>> bookings,
    required List<Map<String, dynamic>> notices,
    DateTime? now,
  }) {
    final current = now ?? DateTime.now();
    final items = <ResidentHomeHighlight>[];

    final openInvoices = invoices.where((invoice) {
      final status = (invoice['status']?.toString() ?? 'ISSUED').toUpperCase();
      return !const {'PAID', 'CANCELLED', 'VOID', 'REVERSED'}.contains(status);
    }).toList()
      ..sort((a, b) {
        final aDue = _date(a['dueDate']) ?? DateTime(9999);
        final bDue = _date(b['dueDate']) ?? DateTime(9999);
        return aDue.compareTo(bDue);
      });
    if (openInvoices.isNotEmpty) {
      final invoice = openInvoices.first;
      final due = _date(invoice['dueDate']);
      final amount = _money(invoice['balancePaise'] ?? invoice['amountPaise'] ?? invoice['totalPaise']);
      final overdue = due != null && due.isBefore(DateTime(current.year, current.month, current.day));
      final title = (overdue ? 'Maintenance overdue' : 'Maintenance due') + (amount == null ? '' : ' · ' + amount);
      final subtitle = due == null ? 'Review your maintenance account' : (overdue ? 'Was due ' : 'Due ') + _dateLabel(due);
      items.add(ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.billing,
        title: title,
        subtitle: subtitle,
        priority: overdue ? 0 : 2,
      ));
    }

    final activeBookings = bookings.where((booking) {
      final status = (booking['status']?.toString() ?? '').toUpperCase();
      return const {'REQUESTED', 'CONFIRMED', 'IN_PROGRESS'}.contains(status);
    }).toList()
      ..sort((a, b) {
        final aDate = _date(a['scheduledFrom']) ?? DateTime(9999);
        final bDate = _date(b['scheduledFrom']) ?? DateTime(9999);
        return aDate.compareTo(bDate);
      });
    if (activeBookings.isNotEmpty) {
      final booking = activeBookings.first;
      final offering = booking['offering'];
      final name = offering is Map ? offering['name']?.toString() : null;
      final scheduled = _date(booking['scheduledFrom']);
      items.add(ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.service,
        title: name?.trim().isNotEmpty == true ? name! : 'Upcoming home service',
        subtitle: scheduled == null ? 'Service booking in progress' : 'Scheduled ' + _dateLabel(scheduled),
        priority: 3,
      ));
    }

    if (notices.isNotEmpty) {
      final latest = [...notices]..sort((a, b) {
        final aDate = _date(a['publishedAt'] ?? a['createdAt']) ?? DateTime(1970);
        final bDate = _date(b['publishedAt'] ?? b['createdAt']) ?? DateTime(1970);
        return bDate.compareTo(aDate);
      });
      final notice = latest.first;
      items.add(ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.notice,
        title: notice['title']?.toString() ?? 'Society notice',
        subtitle: notice['requiresAcknowledgement'] == true ? 'Acknowledgement requested' : 'Latest society update',
        priority: notice['requiresAcknowledgement'] == true ? 1 : 4,
      ));
    }

    items.sort((a, b) => a.priority.compareTo(b.priority));
    return items.take(3).toList(growable: false);
  }

  static DateTime? _date(Object? value) {
    final text = value?.toString();
    if (text == null || text.isEmpty) return null;
    return DateTime.tryParse(text)?.toLocal();
  }

  static String? _money(Object? paise) {
    if (paise is! num) return null;
    return '₹' + (paise / 100).toStringAsFixed(2);
  }

  static String _dateLabel(DateTime value) =>
      value.day.toString().padLeft(2, '0') + '/' + value.month.toString().padLeft(2, '0') + '/' + value.year.toString();
}
