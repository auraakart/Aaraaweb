import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_error_message.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  test('resident error messages map known statuses without leaking backend detail',(){
    expect(
      residentErrorMessage(ApiException(401,'secret token details')),
      'Your session has expired. Sign in again.',
    );
    expect(
      residentErrorMessage(ApiException(403,'database role debug trace')),
      'You do not have access to perform this action.',
    );
    expect(
      residentErrorMessage(ApiException(409,'internal version mismatch 123')),
      'This item changed. Refresh and try again.',
    );
    expect(
      residentErrorMessage(ApiException(500,'database stack trace must not leak'),fallback:'Could not complete request.'),
      'Could not complete request.',
    );
  });

  test('resident error messages preserve only approved local context',(){
    expect(
      residentErrorMessage(StateError('Select a property before creating a visitor pass')),
      'Select a property and try again.',
    );
    expect(
      residentErrorMessage(StateError('Access request is outside the active property context')),
      'This item is outside the selected property.',
    );
    expect(
      residentErrorMessage(StateError('internal invariant x=42')),
      'Something went wrong. Check your connection and try again.',
    );
  });
}
