import 'demo_household_state.dart';

/// Local sample responses only. Real queries always use authorized API tools.
class DemoAiAssistantAnswers {
  static Map<String, dynamic> answer(String message, {required String? unitId}) {
    final normalized = message.toLowerCase().trim();
    // The demo uses only its explicitly selected synthetic unit's household.
    final householdId = switch (unitId) {
      'demo-unit-1' => 'demo-household-1',
      'demo-unit-2' => 'demo-household-2',
      _ => null,
    };
    if (RegExp(r'\b(?:family|household)\s+members?\b|\bmembers?\s+(?:of\s+)?(?:(?:my|our)\s+)?(?:family|household)\b').hasMatch(normalized)) {
      if (householdId == null) return _selectHome;
      final members = DemoHouseholdState.familyFor(householdId)
          .where((row) => row['relation'] == 'FAMILY_MEMBER'
              && row['user'] is Map && (row['user'] as Map)['status'] == 'ACTIVE')
          .map((row) => ((row['user'] as Map)['name'] ?? '').toString().trim())
          .where((name) => name.isNotEmpty).take(30).toList(growable: false);
      return {
        'answer': members.isEmpty
            ? 'Demo household: no active approved family members are recorded. Open Profile → Family members.'
            : 'Demo household: '+members.length.toString()+' approved family member(s): '+members.join(', ')+'. Open Profile → Family members for management.',
        'facts': {'members': members, 'limitedTo': 30},
        'sources': ['Demo household fixture'],
      };
    }
    if (RegExp(r'\b(?:(?:my|our)\s+(?:registered\s+)?(?:vehicles?|cars?|bikes?)|registered\s+(?:vehicles?|cars?|bikes?)|vehicle\s+list)\b').hasMatch(normalized)) {
      if (householdId == null) return _selectHome;
      final vehicles = DemoHouseholdState.vehiclesFor(householdId)
          .where((item) => item['active'] != false)
          .take(20)
          .map((item) {
            final plate = (item['plateNumber'] ?? '').toString().replaceAll(RegExp('[^A-Za-z0-9]'), '').toUpperCase();
            return {
              'vehicleType': (item['vehicleType'] ?? '').toString(),
              'make': (item['make'] ?? '').toString(),
              'plateSuffix': plate.length >= 4 ? plate.substring(plate.length - 4) : '',
            };
          }).toList(growable: false);
      final summary = vehicles.map((v) => v['vehicleType'].toString()+' '+v['make'].toString()+' · plate ending '+v['plateSuffix'].toString()).join('; ');
      return {
        'answer': vehicles.isEmpty
            ? 'Demo household: no active registered vehicles. Open Profile → Vehicles.'
            : 'Demo household: '+vehicles.length.toString()+' registered vehicle(s): '+summary+'. Open Profile → Vehicles.',
        'facts': {'vehicles': vehicles, 'limitedTo': 20},
        'sources': ['Demo household fixture'],
      };
    }
    if (RegExp(r"\b(?:(?:my|our)\s+(?:parcels?|packages?|deliver(?:y|ies))|(?:parcels?|packages?)\s+(?:for me|waiting|status)|(?:do|did)\s+i\s+have\s+(?:any\s+)?(?:packages?|parcels?|deliveries)|where(?:'s| is)\s+my\s+(?:package|parcel|delivery))\b").hasMatch(normalized)) {
      if (householdId == null) return _selectHome;
      // The Parcel demo screen has two waiting shipments and one collected
      // shipment for the first fixture unit. Never include pickup codes.
      if (householdId == 'demo-household-2') {
        return {
          'answer': 'Demo household: no parcel records are available for this home.',
          'facts': {'waitingCount': 0, 'collectedCount': 0},
          'sources': ['Demo parcel fixture'],
        };
      }
      return {
        'answer': 'Demo parcel snapshot: 2 packages are waiting at the parcel desk (Amazon and BlueDart); 1 was collected. Open Parcels for details and pickup-code actions.',
        'facts': {'waitingCount': 2, 'collectedCount': 1, 'limitedTo': 20},
        'sources': ['Demo parcel fixture'],
      };
    }
    if (RegExp(r"\b(?:what(?:'s| is) happening today|daily brief(?:ing)?|morning brief(?:ing)?|what should i know today)\b").hasMatch(normalized)) {
      if (householdId == null) return _selectHome;
      return {
        'answer': 'Demo society snapshot for your selected home: check published society updates, visitor requests, helpdesk requests and maintenance bills in their respective screens. This is simulated data, not live activity.',
        'facts': {'demo': true},
        'sources': ['Demo society fixture'],
      };
    }
    if (RegExp(r'\b(?:(?:my|our)\s+parking\s+(?:slot|space|bay)|where\s+is\s+my\s+parking)\b').hasMatch(normalized)) {
      return {
        'answer': 'This demo cannot confirm an allocated parking bay. Registered vehicles do not prove parking allocation. Please check the Parking screen or society management.',
        'facts': <String, dynamic>{}, 'sources': <String>[],
      };
    }
    if (RegExp(r'\b(?:society\s+rules?|bylaws?|pet\s+policy|parking\s+policy|waste\s+(?:collection|rules?)|swimming\s+pool\s+rules?)\b').hasMatch(normalized)) {
      return {
        'answer': 'Society rules require an approved published policy. This demo has no verified policy text for that question. Check society documents or contact management.',
        'facts': <String, dynamic>{}, 'sources': <String>[],
      };
    }
    if (RegExp(r'\b(dues?|maintenance|bills?|invoices?|receipts?|payments?)\b').hasMatch(normalized)) {
      return {
        'answer': 'Your September maintenance bill is ₹4,250 and is due on 25 September. Your August bill is fully paid.',
        'facts': {'outstanding': '₹4,250', 'period': 'September 2026', 'dueDate': '25 Sep 2026', 'lastPayment': '₹4,250 on 05 Aug 2026 via UPI'},
        'sources': ['Maintenance billing', 'Payment receipts'],
      };
    }
    if (RegExp(r'\b(complaints?|helpdesk|tickets?)\b').hasMatch(normalized)) {
      return {
        'answer': 'You have 2 active helpdesk requests. Water seepage near the balcony is high priority; the corridor-light request is already in progress.',
        'facts': {'activeRequests': 2, 'highPriority': 'Water seepage near balcony', 'inProgress': 'Corridor light not working'},
        'sources': ['Helpdesk', 'SLA status'],
      };
    }
    if (RegExp(r'\b(visitors?|staff|gates?|domestic help|maids?|drivers?)\b').hasMatch(normalized)) {
      return {
        'answer': 'Amit Verma is waiting for approval. One delivery and one cab entry were also recorded today. Lakshmi and Ramesh are active household staff.',
        'facts': {'waitingApproval': 'Amit Verma', 'recentEntries': 3, 'activeStaff': 4},
        'sources': ['Gate access', 'Domestic help'],
      };
    }
    if (RegExp(r'\b(amenit(?:y|ies)|bookings?|clubhouse|badminton|swimming pool|guest rooms?)\b').hasMatch(normalized)) {
      return {
        'answer': 'Badminton, clubhouse, swimming pool and guest-room options are available in this demo. Weekend slots are usually the busiest.',
        'facts': {'recommended': 'Badminton court · Saturday 6:00 PM', 'otherOptions': ['Clubhouse', 'Swimming pool', 'Guest room']},
        'sources': ['Amenities', 'Booking availability'],
      };
    }
    if (RegExp(r'\b(notices?|announcements?|(?:society|community)\s+updates?)\b').hasMatch(normalized)) {
      return {
        'answer': 'Key updates: lift maintenance is scheduled tomorrow, the Ganesh festival programme starts Friday at 6:30 PM, and September maintenance is pending.',
        'facts': {'priorityUpdates': 3, 'nextEvent': 'Ganesh festival · Friday 6:30 PM'},
        'sources': ['Society notices', 'Community calendar', 'Billing'],
      };
    }
    if (RegExp(r'\b(services?|providers?|plumbers?|electricians?|cleaning)\b').hasMatch(normalized)) {
      return {
        'answer': 'Browse available providers in the Services tab. This demo assistant cannot confirm live service availability or complete a booking from a free-text question.',
        'facts': <String, dynamic>{},
        'sources': <String>[],
      };
    }
    if (RegExp(r'\b(vehicles?|parking|family|household|residents?|occupants?|profile|documents?|privacy|security|emergenc(?:y|ies)|community|society|facilities|vendors?|deliver(?:y|ies))\b').hasMatch(normalized)) {
      return {
        'answer': 'That is an Aaraagate topic, but this assistant demo cannot answer it yet. Try the relevant app screen, or ask about dues, visitors, staff, complaints, amenities, services or society updates.',
        'facts': <String, dynamic>{},
        'sources': <String>[],
      };
    }
    return {
      'answer': 'That question is outside Aaraagate Assistant’s scope. I can help with maintenance dues, visitors, household staff, complaints, amenities, services and society updates.',
      'facts': <String, dynamic>{},
      'sources': <String>[],
    };
  }


  static const Map<String, dynamic> _selectHome = {
    'answer': 'Select one of the supported demo homes to view simulated private household details.',
    'facts': <String, dynamic>{},
    'sources': <String>[],
  };
}
