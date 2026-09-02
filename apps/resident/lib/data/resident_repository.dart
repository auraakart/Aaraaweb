import 'api_client.dart';

class ResidentRepository {
  ResidentRepository(this.api);
  final ApiClient api;

  Future<List<Map<String, dynamic>>> households() async {
    final value = await api.get('/api/v1/households/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> accessRequests() async {
    final value = await api.get('/api/v1/access-requests/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> notices() async {
    final value = await api.get('/api/v1/notices');
    return _list(value);
  }

  Stream<Map<String, dynamic>> accessEvents() => api.sse('/api/v1/notifications/resident-stream');

  Future<void> registerPushDevice({required String token, required String platform, String? deviceId}) =>
      api.post('/api/v1/notifications/devices/register', {
        'token': token,
        'platform': platform,
        if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
      });

  Future<void> unregisterPushDevice(String token) =>
      api.post('/api/v1/notifications/devices/unregister', {'token': token});

  Future<List<Map<String, dynamic>>> serviceCategories() async {
    final value = await api.get('/api/v1/services-marketplace/categories');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> serviceOfferings({String? categoryId}) async {
    final suffix = categoryId == null ? '' : '?categoryId=$categoryId';
    final value = await api.get('/api/v1/services-marketplace/offerings$suffix');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> bookings() async {
    final value = await api.get('/api/v1/services-marketplace/bookings/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> workforce() async {
    final value = await api.get('/api/v1/workforce/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> workforceLeaves() async {
    final value = await api.get('/api/v1/workforce/leaves/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> workforceRatings() async {
    final value = await api.get('/api/v1/workforce/ratings/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> helpdeskTickets() async {
    final value = await api.get('/api/v1/helpdesk/mine');
    return _list(value);
  }

  Future<List<Map<String, dynamic>>> helpdeskActivities(String ticketId) async {
    final value = await api.get('/api/v1/helpdesk/$ticketId/activities');
    return _list(value);
  }

  Future<Map<String, dynamic>> createHelpdeskTicket({
    required String unitId,
    required String title,
    required String description,
    String? category,
    String priority = 'NORMAL',
  }) async {
    final value = await api.post('/api/v1/helpdesk', {
      'unitId': unitId,
      'title': title.trim(),
      'description': description.trim(),
      'priority': priority,
      if (category != null && category.trim().isNotEmpty) 'category': category.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> addHelpdeskComment(String ticketId, String message) =>
      api.post('/api/v1/helpdesk/$ticketId/comments', {'message': message.trim()});

  Future<Map<String, dynamic>> createWorkforceLeave({
    required String assignmentId,
    required DateTime startsOn,
    required DateTime endsOn,
    String? reason,
  }) async {
    final value = await api.post('/api/v1/workforce/leaves', {
      'assignmentId': assignmentId,
      'startsOn': _dateOnly(startsOn),
      'endsOn': _dateOnly(endsOn),
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> cancelWorkforceLeave(String leaveId) async {
    final value = await api.patch('/api/v1/workforce/leaves/$leaveId/cancel');
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> rateWorkforce(String assignmentId, {required int score, String? comment}) async {
    final value = await api.put('/api/v1/workforce/ratings/$assignmentId', {
      'score': score,
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> approveAccess(String requestId, {required DateTime validFrom, required DateTime validUntil}) async {
    final value = await api.post('/api/v1/access-requests/$requestId/approve', {
      'validFrom': validFrom.toUtc().toIso8601String(),
      'validUntil': validUntil.toUtc().toIso8601String(),
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> denyAccess(String requestId) => api.post('/api/v1/access-requests/$requestId/deny');
  Future<void> cancelAccess(String requestId) => api.post('/api/v1/access-requests/$requestId/cancel');

  Future<Map<String, dynamic>> createAccess({required String unitId, required String subjectType, required String subjectName, String? subjectPhone, String? purpose}) async {
    final value = await api.post('/api/v1/access-requests', {
      'unitId': unitId,
      'subjectType': subjectType,
      'subjectName': subjectName,
      if (subjectPhone != null) 'subjectPhone': subjectPhone,
      if (purpose != null) 'purpose': purpose,
    });
    return Map<String, dynamic>.from(value as Map);
  }

  Future<Map<String, dynamic>> inviteVisitor({required String unitId, required String name, required DateTime validFrom, required DateTime validUntil, String? phone, String? purpose}) async {
    final value = await api.post('/api/v1/access-requests/visitor-invites', {
      'unitId': unitId,
      'name': name,
      'validFrom': validFrom.toUtc().toIso8601String(),
      'validUntil': validUntil.toUtc().toIso8601String(),
      if (phone != null) 'phone': phone,
      if (purpose != null) 'purpose': purpose,
    });
    return Map<String, dynamic>.from(value as Map);
  }

  String _dateOnly(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> _list(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }
}
