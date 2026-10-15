import 'guard_api.dart';

String guardParcelPickupRecovery(GuardApiException error) {
  if (error.transport) {
    return 'Pickup code verification could not reach the server. Check the connection and retry; do not hand over the parcel until verification succeeds.';
  }
  if (error.statusCode == 401) {
    return 'The guard session has expired. Sign in again before verifying or handing over the parcel.';
  }
  if (error.statusCode == 403) {
    return 'This account is not allowed to process parcel handover. Ask a security supervisor to verify the parcel.';
  }

  final message = error.message.toLowerCase();
  if (message.contains('has not been issued')) {
    return 'No pickup code is active. Ask the resident to generate a pickup code, then verify it before handover.';
  }
  if (message.contains('expired')) {
    return 'The pickup code has expired. Ask the resident to generate a new pickup code; do not hand over until the new code verifies.';
  }
  if (message.contains('locked')) {
    return 'The pickup code is locked after too many attempts. Ask the resident to generate a new pickup code; do not hand over until it verifies.';
  }
  if (message.contains('invalid pickup code')) {
    return 'The pickup code did not match. Recheck the six digits with the resident. Repeated failures can lock the code; do not hand over until verification succeeds.';
  }
  if (message.contains('must be 6 digits')) {
    return 'Enter the full 6-digit pickup code. Do not hand over the parcel until verification succeeds.';
  }
  if (message.contains('uncollected parcel not found')) {
    return 'This parcel is no longer available for collection. Refresh the parcel desk before taking any handover action.';
  }
  return 'Pickup code could not be verified. Check the code with the resident and retry; do not hand over the parcel until verification succeeds.';
}
