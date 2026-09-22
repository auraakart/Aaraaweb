import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('GuardWorkforceAssignment parses gate workforce boundary', () {
    final assignment = GuardWorkforceAssignment.fromJson({
      'id': 'assignment-1',
      'worker': {'name': 'Lakshmi', 'role': 'MAID'},
      'household': {
        'unit': {
          'number': 'A-204',
          'building': {'name': 'Tower A', 'code': 'A'}
        }
      }
    });

    expect(assignment.id, 'assignment-1');
    expect(assignment.workerName, 'Lakshmi');
    expect(assignment.workerRole, 'MAID');
    expect(assignment.unitNumber, 'A-204');
    expect(assignment.buildingName, 'Tower A');
  });

  test('GuardSocietyWorker parses society-scoped gate eligibility', () {
    final worker = GuardSocietyWorker.fromJson({
      'id': 'worker-1',
      'name': 'Ravi Kumar',
      'role': 'GARDENER',
      'department': 'GARDENING',
      'employer': 'GreenCare Services',
      'present': true,
    });

    expect(worker.id, 'worker-1');
    expect(worker.name, 'Ravi Kumar');
    expect(worker.role, 'GARDENER');
    expect(worker.department, 'GARDENING');
    expect(worker.employer, 'GreenCare Services');
    expect(worker.present, isTrue);
  });

  test('GuardWorkforceAssignment rejects missing relationship structure', () {
    expect(
      () => GuardWorkforceAssignment.fromJson({'id': 'assignment-1'}),
      throwsFormatException,
    );
  });
}
