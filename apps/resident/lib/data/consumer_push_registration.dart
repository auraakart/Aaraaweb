import 'resident_repository.dart';

extension ConsumerPushRegistration on ResidentRepository {
  Future<void> registerConsumerPushDevice({
    required String token,
    required String platform,
    String? deviceId,
  }) =>
      api.post('/api/v1/consumer/notifications/devices/register', {
        'token': token,
        'platform': platform,
        if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
      });

  Future<void> unregisterConsumerPushDevice(String token) =>
      api.post('/api/v1/consumer/notifications/devices/unregister', {'token': token});
}
