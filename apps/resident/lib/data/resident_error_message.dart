import 'api_client.dart';

String residentErrorMessage(
  Object error, {
  String fallback = 'Something went wrong. Check your connection and try again.',
}) {
  if (error is ApiException) {
    switch (error.statusCode) {
      case 401:
        return 'Your session has expired. Sign in again.';
      case 403:
        return 'You do not have access to perform this action.';
      case 409:
        return 'This item changed. Refresh and try again.';
      case 429:
        return 'Too many attempts. Please try again shortly.';
    }
    return fallback;
  }

  if (error is StateError) {
    final message = error.message.toString();
    if (message.contains('Select a property')) return 'Select a property and try again.';
    if (message.contains('outside the active property context')) return 'This item is outside the selected property.';
  }
  return fallback;
}
