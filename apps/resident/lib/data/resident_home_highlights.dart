enum ResidentHomeHighlightKind { billing, helpdesk, service, notice }
enum ResidentHomeUrgency { immediate, soon, info }

class ResidentHomeHighlight {
  const ResidentHomeHighlight({
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.priority,
    required this.urgency,
  });

  final ResidentHomeHighlightKind kind;
  final String title;
  final String subtitle;
  final int priority;
  final ResidentHomeUrgency urgency;
}

class ResidentHomeHighlights {
  static List<ResidentHomeHighlight> build({
    required List<Map<String, dynamic>> invoices,
    required List<Map<String, dynamic>> bookings,
    required List<Map<String, dynamic>> notices,
    List<Map<String, dynamic>> payments = const [],
    List<Map<String, dynamic>> tickets = const [],
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
    ResidentHomeHighlight? invoiceBilling;
    if (openInvoices.isNotEmpty) {
      final invoice = openInvoices.first;
      final due = _date(invoice['dueDate']);
      final amount = _money(invoice['balancePaise'] ?? invoice['amountPaise'] ?? invoice['totalPaise']);
      final overdue = due != null && due.isBefore(DateTime(current.year, current.month, current.day));
      final title = (overdue ? 'Maintenance overdue' : 'Maintenance due') + (amount == null ? '' : ' · ' + amount);
      final subtitle = due == null ? 'Review your maintenance account' : (overdue ? 'Was due ' : 'Due ') + _dateLabel(due);
      invoiceBilling = ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.billing,
        title: title,
        subtitle: subtitle,
        priority: overdue ? 0 : 2,
        urgency: overdue ? ResidentHomeUrgency.immediate : ResidentHomeUrgency.soon,
      );
    }

    ResidentHomeHighlight? recoveryBilling;
    final openInvoiceIds = openInvoices.map((invoice) => invoice['id']?.toString()).whereType<String>().toSet();
    final recoveryPayments = payments.where((payment) {
      final status = (payment['status']?.toString() ?? '').toUpperCase();
      return openInvoiceIds.contains(payment['invoiceId']?.toString()) &&
          const {'CREATED', 'AUTHORIZED', 'FAILED'}.contains(status);
    }).toList()
      ..sort((a, b) {
        final aDate = _date(a['createdAt']) ?? DateTime(1970);
        final bDate = _date(b['createdAt']) ?? DateTime(1970);
        return bDate.compareTo(aDate);
      });
    if (recoveryPayments.isNotEmpty) {
      final payment = recoveryPayments.first;
      final status = (payment['status']?.toString() ?? '').toUpperCase();
      final amount = _money(payment['amountPaise']);
      final suffix = amount == null ? '' : ' · ' + amount;
      switch (status) {
        case 'FAILED':
          recoveryBilling = ResidentHomeHighlight(
            kind: ResidentHomeHighlightKind.billing,
            title: 'Payment needs attention' + suffix,
            subtitle: 'Previous payment was not confirmed · retry from Billing',
            priority: 0,
            urgency: ResidentHomeUrgency.immediate,
          );
          break;
        case 'AUTHORIZED':
          recoveryBilling = ResidentHomeHighlight(
            kind: ResidentHomeHighlightKind.billing,
            title: 'Payment confirmation pending' + suffix,
            subtitle: 'Gateway authorization is awaiting final capture · do not pay again yet',
            priority: 1,
            urgency: ResidentHomeUrgency.soon,
          );
          break;
        case 'CREATED':
          recoveryBilling = ResidentHomeHighlight(
            kind: ResidentHomeHighlightKind.billing,
            title: 'Payment not completed' + suffix,
            subtitle: 'Payment order exists but is not confirmed · continue from Billing',
            priority: 1,
            urgency: ResidentHomeUrgency.soon,
          );
          break;
      }
    }

    final billing = recoveryBilling != null &&
            (invoiceBilling == null || recoveryBilling.priority <= invoiceBilling.priority)
        ? recoveryBilling
        : invoiceBilling;
    if (billing != null) items.add(billing);

    final activeTickets = tickets.where((ticket) {
      final status = (ticket['status']?.toString() ?? '').toUpperCase();
      return const {'OPEN', 'IN_PROGRESS', 'REOPENED'}.contains(status);
    }).toList()
      ..sort((a, b) {
        final ap = _ticketPriority(a['priority']);
        final bp = _ticketPriority(b['priority']);
        if (ap != bp) return ap.compareTo(bp);
        final aDate = _date(a['updatedAt'] ?? a['createdAt']) ?? DateTime(1970);
        final bDate = _date(b['updatedAt'] ?? b['createdAt']) ?? DateTime(1970);
        return bDate.compareTo(aDate);
      });
    if (activeTickets.isNotEmpty) {
      final ticket = activeTickets.first;
      final priority = (ticket['priority']?.toString() ?? 'NORMAL').toUpperCase();
      items.add(ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.helpdesk,
        title: ticket['title']?.toString() ?? 'Helpdesk request',
        subtitle: priority == 'CRITICAL' || priority == 'HIGH'
            ? '${_display(priority)} priority · action in progress'
            : 'Helpdesk request in progress',
        priority: priority == 'CRITICAL' ? 0 : priority == 'HIGH' ? 1 : 3,
        urgency: priority == 'CRITICAL' ? ResidentHomeUrgency.immediate : priority == 'HIGH' ? ResidentHomeUrgency.soon : ResidentHomeUrgency.info,
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
        urgency: ResidentHomeUrgency.info,
      ));
    }

    if (notices.isNotEmpty) {
      final latest = [...notices]..sort((a, b) {
        final aDate = _date(a['publishedAt'] ?? a['createdAt']) ?? DateTime(1970);
        final bDate = _date(b['publishedAt'] ?? b['createdAt']) ?? DateTime(1970);
        return bDate.compareTo(aDate);
      });
      final notice = latest.first;
      final requiresAcknowledgement = notice['requiresAcknowledgement'] == true;
      final acknowledged = notice['acknowledgedAt'] != null;
      final pendingAcknowledgement = requiresAcknowledgement && !acknowledged;
      items.add(ResidentHomeHighlight(
        kind: ResidentHomeHighlightKind.notice,
        title: notice['title']?.toString() ?? 'Society notice',
        subtitle: pendingAcknowledgement
            ? 'Acknowledgement requested'
            : acknowledged
                ? 'Acknowledged'
                : 'Latest society update',
        priority: pendingAcknowledgement ? 1 : 4,
        urgency: pendingAcknowledgement ? ResidentHomeUrgency.soon : ResidentHomeUrgency.info,
      ));
    }

    items.sort((a, b) => a.priority.compareTo(b.priority));
    return items.take(3).toList(growable: false);
  }

  static int _ticketPriority(Object? value) {
    switch ((value?.toString() ?? '').toUpperCase()) {
      case 'CRITICAL': return 0;
      case 'HIGH': return 1;
      case 'NORMAL': return 2;
      case 'LOW': return 3;
      default: return 4;
    }
  }

  static String _display(String value) => value.toLowerCase().split('_').map((word) => word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}').join(' ');

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
