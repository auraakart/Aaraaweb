import 'dart:async';
import 'package:flutter/material.dart';
import '../data/amenity_actions.dart';
import '../data/api_client.dart';
import '../data/resident_repository.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class AmenitiesScreen extends StatefulWidget {
  const AmenitiesScreen({super.key, required this.repository, required this.unitId});

  final ResidentRepository repository;
  final String unitId;

  @override
  State<AmenitiesScreen> createState() => _AmenitiesScreenState();
}

class _AmenitiesScreenState extends State<AmenitiesScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _amenities = const [];
  List<Map<String, dynamic>> _bookings = const [];
  List<Map<String, dynamic>> _waitlist = const [];
  final Map<String, String> _bookingAttemptKeys = <String, String>{};
  final Map<String, String> _depositPaymentAttemptKeys = <String, String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        widget.repository.amenities(),
        widget.repository.amenityBookings(widget.unitId),
        widget.repository.amenityWaitlist(widget.unitId),
      ]);
      if (!mounted) return;
      setState(() {
        _amenities = results[0];
        _bookings = results[1];
        final payableDepositBookingIds = results[1]
            .where((item) => item['status']?.toString() == 'CONFIRMED' &&
                item['depositStatus']?.toString() == 'PAYMENT_REQUIRED')
            .map((item) => item['id']?.toString())
            .whereType<String>()
            .toSet();
        _depositPaymentAttemptKeys.removeWhere(
            (bookingId, _) => !payableDepositBookingIds.contains(bookingId));
        _waitlist = results[2];
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyError(error);
      });
    }
  }

  Future<void> _book(Map<String, dynamic> amenity) async {
    final slotMinutes = _asInt(amenity['slotMinutes'], fallback: 60);
    final selection = await showModalBottomSheet<_BookingSelection>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _BookingSheet(
        amenity: amenity,
        slotMinutes: slotMinutes,
      ),
    );
    if (selection == null || !mounted) return;
    widget.repository.recordUsage('AMENITY_BOOKING_STARTED').ignore();

    final startsAt = selection.startsAt;
    final endsAt = startsAt.add(Duration(minutes: slotMinutes));
    if (!startsAt.isAfter(DateTime.now())) {
      _showMessage('Choose a future time slot.');
      return;
    }

    final bookingIntent = [
      amenity['id'].toString(),
      widget.unitId,
      startsAt.toUtc().toIso8601String(),
      endsAt.toUtc().toIso8601String(),
      selection.guestCount.toString(),
    ].join('|');
    final attemptKey = _bookingAttemptKeys.putIfAbsent(
      bookingIntent,
      () => 'resident-amenity-${DateTime.now().microsecondsSinceEpoch}',
    );

    setState(() => _submitting = true);
    try {
      final created = await widget.repository.createAmenityBooking(
        amenityId: amenity['id'].toString(),
        unitId: widget.unitId,
        startsAt: startsAt,
        endsAt: endsAt,
        guestCount: selection.guestCount,
        idempotencyKey: attemptKey,
      );
      _bookingAttemptKeys.remove(bookingIntent);
      if (!mounted) return;
      _showMessage(created['status']?.toString() == 'PENDING'
          ? 'Booking request sent for approval.'
          : 'Amenity booked.');
      await _load();
    } catch (error) {
      if (!mounted) return;
      if (_isCapacityConflict(error)) {
        _bookingAttemptKeys.remove(bookingIntent);
        final join = await _confirmWaitlist(amenity, startsAt, selection.guestCount);
        if (join == true && mounted) {
          try {
            final entry = await widget.repository.joinAmenityWaitlist(
              amenityId: amenity['id'].toString(),
              unitId: widget.unitId,
              startsAt: startsAt,
              endsAt: endsAt,
              guestCount: selection.guestCount,
            );
            if (!mounted) return;
            final position = _asInt(entry['position'], fallback: 0);
            _showMessage(position > 0 ? 'Added to waitlist · position $position.' : 'Added to waitlist.');
            await _load();
          } catch (waitlistError) {
            List<Map<String,dynamic>>? refreshedWaitlist;
            try {
              refreshedWaitlist = await widget.repository.amenityWaitlist(widget.unitId);
            } catch (_) {
              refreshedWaitlist = null;
            }
            if (!mounted) return;
            Map<String,dynamic>? recoveredWaitlist;
            if (refreshedWaitlist != null) {
              for (final item in refreshedWaitlist) {
                if (item['status']?.toString() == 'WAITING' &&
                    item['amenityId']?.toString() == amenity['id']?.toString() &&
                    item['unitId']?.toString() == widget.unitId &&
                    _sameInstant(item['startsAt'], startsAt) &&
                    _sameInstant(item['endsAt'], endsAt) &&
                    _asInt(item['guestCount'], fallback: 0) == selection.guestCount) {
                  recoveredWaitlist = item;
                  break;
                }
              }
            }
            if (recoveredWaitlist != null) {
              setState(() => _waitlist = refreshedWaitlist!);
              final position = _asInt(recoveredWaitlist['position'], fallback: 0);
              _showMessage(position > 0
                  ? 'Waitlist join confirmed after reconnect · position $position.'
                  : 'Waitlist join confirmed after reconnect.');
            } else {
              _showMessage(_friendlyError(waitlistError));
            }
          }
        }
      } else if (error is ApiException && error.statusCode >= 400 && error.statusCode < 500) {
        _bookingAttemptKeys.remove(bookingIntent);
        _showMessage(_friendlyError(error));
      } else {
        List<Map<String,dynamic>>? refreshed;
        try {
          refreshed = await widget.repository.amenityBookings(widget.unitId);
        } catch (_) {
          refreshed = null;
        }
        if (!mounted) return;
        Map<String,dynamic>? recovered;
        if (refreshed != null) {
          for (final booking in refreshed) {
            if (booking['idempotencyKey']?.toString() == attemptKey &&
                booking['amenityId']?.toString() == amenity['id']?.toString() &&
                booking['unitId']?.toString() == widget.unitId &&
                booking['startsAt']?.toString() == startsAt.toUtc().toIso8601String() &&
                booking['endsAt']?.toString() == endsAt.toUtc().toIso8601String() &&
                _asInt(booking['guestCount'], fallback: 0) == selection.guestCount) {
              recovered = booking;
              break;
            }
          }
        }
        if (recovered != null) {
          _bookingAttemptKeys.remove(bookingIntent);
          setState(() => _bookings = refreshed!);
          _showMessage(recovered['status']?.toString() == 'PENDING'
              ? 'Booking request confirmed after reconnect.'
              : 'Amenity booking confirmed after reconnect.');
        } else {
          _showMessage('Booking outcome could not be confirmed. Retry the same slot to continue safely.');
        }
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<bool?> _confirmWaitlist(Map<String,dynamic> amenity,DateTime startsAt,int guestCount) {
    return showModalBottomSheet<bool>(
      context:context,
      useSafeArea:true,
      builder:(sheetContext){
        final theme=Theme.of(sheetContext);
        return Padding(
          padding:const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter,AaraagateTokens.space2,AaraagateTokens.pageGutter,AaraagateTokens.space6),
          child:Column(
            mainAxisSize:MainAxisSize.min,
            crossAxisAlignment:CrossAxisAlignment.start,
            children:[
              Text('Slot just filled',style:theme.textTheme.headlineSmall),
              const SizedBox(height:AaraagateTokens.space2),
              Text('${amenity['name'] ?? 'Amenity'} · ${_formatDateTime(startsAt)}'),
              if(guestCount>0) ...[
                const SizedBox(height:AaraagateTokens.space1),
                Text('$guestCount guest${guestCount==1?'':'s'} will be preserved if this waitlist entry is promoted.'),
              ],
              const SizedBox(height:AaraagateTokens.space2),
              const Text('You can join the first-in waitlist for this exact time. A cancellation may promote the oldest eligible resident automatically.'),
              const SizedBox(height:AaraagateTokens.space5),
              Row(children:[
                Expanded(child:OutlinedButton(onPressed:()=>Navigator.pop(sheetContext,false),child:const Text('Choose another time'))),
                const SizedBox(width:AaraagateTokens.space3),
                Expanded(child:FilledButton(onPressed:()=>Navigator.pop(sheetContext,true),child:const Text('Join waitlist'))),
              ]),
            ],
          ),
        );
      },
    );
  }

  Future<void> _cancelWaitlist(Map<String,dynamic> entry) async {
    if(entry['status']?.toString()!='WAITING') return;
    setState(()=>_submitting=true);
    try{
      await widget.repository.cancelAmenityWaitlist(entry['id'].toString());
      if(!mounted)return;
      _showMessage('Waitlist entry cancelled.');
      await _load();
    }catch(error){
      if(mounted)_showMessage(_friendlyError(error));
    }finally{
      if(mounted)setState(()=>_submitting=false);
    }
  }

  Future<void> _payDeposit(Map<String,dynamic> booking) async {
    final bookingId=booking['id'].toString();
    final attemptKey=_depositPaymentAttemptKeys.putIfAbsent(
      bookingId,
      ()=>'resident-amenity-deposit-${DateTime.now().microsecondsSinceEpoch}',
    );
    setState(()=>_submitting=true);
    try{
      final order=await widget.repository.createAmenityDepositPayment(
        bookingId:bookingId,
        idempotencyKey:attemptKey,
      );
      _depositPaymentAttemptKeys.remove(bookingId);
      if(!mounted)return;
      final reference=order['providerOrderId']?.toString()??order['id']?.toString()??'created order';
      _showMessage('Secure refundable-deposit payment order ready: $reference. The deposit is not treated as paid until gateway confirmation.');
      await _load();
    }catch(error){
      if(!mounted)return;
      if(error is ApiException&&error.statusCode>=400&&error.statusCode<500){
        _depositPaymentAttemptKeys.remove(bookingId);
        _showMessage(_friendlyError(error));
      }else{
        _showMessage('Deposit payment order outcome could not be confirmed. Retry safely; the same request identity will be reused. The deposit remains unpaid until gateway confirmation.');
      }
    }finally{
      if(mounted)setState(()=>_submitting=false);
    }
  }

  Future<void> _cancel(Map<String, dynamic> booking) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext);
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space2, AaraagateTokens.pageGutter, AaraagateTokens.space6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Cancel booking?', style: theme.textTheme.headlineSmall),
              const SizedBox(height: AaraagateTokens.space2),
              Text('${booking['amenityName'] ?? 'Amenity'} · ${_formatApiDate(booking['startsAt'])}'),
              const SizedBox(height: AaraagateTokens.space5),
              PremiumActionGroup(
                primary: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                    foregroundColor: theme.colorScheme.onError,
                  ),
                  onPressed: () => Navigator.pop(sheetContext, true),
                  child: const Text('Cancel booking'),
                ),
                secondary: OutlinedButton(
                  onPressed: () => Navigator.pop(sheetContext, false),
                  child: const Text('Keep booking'),
                ),
              ),
            ],
          ),
        );
      },
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      await widget.repository.cancelAmenityBooking(booking['id'].toString());
      if (!mounted) return;
      _showMessage('Booking cancelled.');
      await _load();
    } catch (error) {
      final message = await _recoverCancellationFailure(booking, error);
      if (mounted) _showMessage(message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<String> _recoverCancellationFailure(Map<String, dynamic> booking, Object error) async {
    final fallback = _friendlyError(error);
    final bookingId = booking['id']?.toString();
    await _load();
    if (!mounted || _error != null || bookingId == null) return fallback;

    Map<String, dynamic>? refreshed;
    for (final item in _bookings) {
      if (item['id']?.toString() == bookingId) {
        refreshed = item;
        break;
      }
    }
    if (refreshed == null) {
      return 'Booking changed and is no longer in your current booking list.';
    }
    if (!_isCancelable(refreshed)) {
      final status = _titleCase((refreshed['status']?.toString() ?? 'updated').replaceAll('_', ' ').toLowerCase());
      return 'Booking changed. Latest status: $status.';
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final upcoming = [..._bookings]
      ..sort((a, b) => (a['startsAt']?.toString() ?? '').compareTo(b['startsAt']?.toString() ?? ''));

    return Scaffold(
      appBar: AppBar(title: const Text('Amenities')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space3, AaraagateTokens.pageGutter, AaraagateTokens.space8),
          children: [
            if (_loading && _amenities.isEmpty)
              const AppStateCard(icon: Icons.event_available_outlined, message: 'Loading amenities…', loading: true)
            else if (_error != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: _error!, actionLabel: 'Retry', onAction: _load)
            else if (_amenities.isEmpty)
              const AppStateCard(icon: Icons.weekend_outlined, message: 'No bookable amenities are available right now.')
            else ...[
              PremiumPageIntro(
                icon: Icons.calendar_month_outlined,
                title: 'Book a facility',
                supportingText: 'Choose a facility, date and time for your currently selected property.',
                action: AaraagateStatusPill(
                  label: '${_amenities.length} available',
                  tone: AaraagateStatusTone.info,
                ),
              ),
              const SizedBox(height: AaraagateTokens.space5),
              for (final amenity in _amenities) ...[
                _AmenityCard(amenity: amenity, busy: _submitting, onBook: () => _book(amenity)),
                const SizedBox(height: AaraagateTokens.space3),
              ],
            ],
            const SizedBox(height: AaraagateTokens.space6),
            PremiumSectionHeader(
              title:'Your waitlist',
              supportingText:_waitlist.where((item)=>item['status']?.toString()=='WAITING').isEmpty
                ? 'Full slots you join will appear here.'
                : 'Queue position is first-in for this property and exact time.',
              trailing:AaraagateStatusPill(
                label:'${_waitlist.where((item)=>item['status']?.toString()=='WAITING').length}',
                tone:AaraagateStatusTone.neutral,
              ),
            ),
            const SizedBox(height:AaraagateTokens.space3),
            if(!_loading&&_waitlist.isEmpty)
              const AppStateCard(icon:Icons.hourglass_empty_rounded,message:'You are not waiting for any amenity slots for this property.')
            else
              for(final entry in _waitlist) ...[
                _WaitlistCard(
                  entry:entry,
                  busy:_submitting,
                  onCancel:entry['status']?.toString()=='WAITING'?()=>_cancelWaitlist(entry):null,
                ),
                const SizedBox(height:AaraagateTokens.space2),
              ],
            const SizedBox(height: AaraagateTokens.space6),
            PremiumSectionHeader(
              title: 'Your bookings',
              supportingText: upcoming.isEmpty ? 'Confirmed and pending reservations will appear here.' : 'Upcoming reservations for this property.',
              trailing: AaraagateStatusPill(label: '${upcoming.length}', tone: AaraagateStatusTone.neutral),
            ),
            const SizedBox(height: AaraagateTokens.space3),
            if (!_loading && upcoming.isEmpty)
              const AppStateCard(icon: Icons.calendar_month_outlined, message: 'You have no amenity bookings for this property.')
            else
              for (final booking in upcoming) ...[
                _BookingCard(
                  booking: booking,
                  busy: _submitting,
                  onPayDeposit: booking['status']?.toString()=='CONFIRMED'&&booking['depositStatus']?.toString()=='PAYMENT_REQUIRED'
                    ? ()=>_payDeposit(booking)
                    : null,
                  onCancel: _isCancelable(booking) ? () => _cancel(booking) : null,
                ),
                const SizedBox(height: AaraagateTokens.space2),
              ],
          ],
        ),
      ),
    );
  }

  bool _isCancelable(Map<String, dynamic> booking) {
    final status = booking['status']?.toString();
    return status == 'PENDING' || status == 'CONFIRMED';
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), showCloseIcon: true));
  }

  static bool _isCapacityConflict(Object error) =>
      error is ApiException
      && error.statusCode==409
      && error.message.toLowerCase().contains('slot is no longer available');

  static String _friendlyError(Object error) {
    if (error is ApiException) {
      final message = error.message.trim();
      if (error.statusCode == 403) return 'Amenities are not enabled for this society or your role.';
      if (error.statusCode == 401) return 'Your session has expired. Sign in again.';
      if (error.statusCode == 409) {
        if (message.toLowerCase().contains('slot is no longer available')) {
          return 'That slot is no longer available. Choose another time.';
        }
        if (message.isNotEmpty) return message.endsWith('.') ? message : '$message.';
      }
    }
    return 'Amenities could not be loaded. Check your connection and try again.';
  }
}

class _BookingSelection {
  const _BookingSelection(this.startsAt, this.guestCount);
  final DateTime startsAt;
  final int guestCount;
}

class _BookingSheet extends StatefulWidget {
  const _BookingSheet({required this.amenity, required this.slotMinutes});

  final Map<String, dynamic> amenity;
  final int slotMinutes;

  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> {
  late DateTime _date;
  TimeOfDay? _time;
  int _guestCount=0;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _date = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  }

  DateTime? get _startsAt {
    final time = _time;
    if (time == null) return null;
    return DateTime(_date.year, _date.month, _date.day, time.hour, time.minute);
  }

  Future<void> _pickMoreDates() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 180)),
      initialDate: _date,
    );
    if (date != null && mounted) setState(() => _date = date);
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: _time ?? const TimeOfDay(hour: 10, minute: 0),
    );
    if (time != null && mounted) setState(() => _time = time);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final now = DateTime.now();
    final quickDates = List<DateTime>.generate(7, (index) {
      final day = DateTime(now.year, now.month, now.day).add(Duration(days: index + 1));
      return day;
    });
    final approval = widget.amenity['requiresApproval'] == true;
    final rules=widget.amenity['bookingRules'];
    final maxGuests=rules is Map?_asInt(rules['maxGuestsPerBooking'],fallback:0):0;
    final noShowPolicy=_amenityNoShowPolicyLabel(widget.amenity);
    final depositPolicy=_amenityDepositPolicyLabel(widget.amenity);
    final startsAt = _startsAt;
    final invalidPast = startsAt != null && !startsAt.isAfter(now);

    return Padding(
      padding: EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space2, AaraagateTokens.pageGutter, MediaQuery.viewInsetsOf(context).bottom + AaraagateTokens.space6),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.amenity['name']?.toString() ?? 'Amenity', style: theme.textTheme.headlineSmall),
            const SizedBox(height: AaraagateTokens.space2),
            Wrap(
              spacing: AaraagateTokens.space2,
              runSpacing: AaraagateTokens.space2,
              children: [
                AaraagateStatusPill(label: '${widget.slotMinutes} min', tone: AaraagateStatusTone.neutral),
                AaraagateStatusPill(label: _feeLabel(widget.amenity['feePaise']), tone: AaraagateStatusTone.neutral),
                AaraagateStatusPill(label: approval ? 'Approval required' : 'Server confirmed', tone: approval ? AaraagateStatusTone.warning : AaraagateStatusTone.info),
                AaraagateStatusPill(label:maxGuests>0?'Up to $maxGuests guests':'No guests',tone:AaraagateStatusTone.neutral),
                if(noShowPolicy!=null)const AaraagateStatusPill(label:'Fair-use no-show rule',tone:AaraagateStatusTone.warning),
                if(depositPolicy!=null)AaraagateStatusPill(label:depositPolicy,tone:AaraagateStatusTone.info),
              ],
            ),
            const SizedBox(height: AaraagateTokens.space6),
            const PremiumSectionHeader(title: 'Choose date'),
            const SizedBox(height: AaraagateTokens.space3),
            SizedBox(
              height: 72 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, double.infinity),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: quickDates.length,
                separatorBuilder: (_, __) => const SizedBox(width: AaraagateTokens.space2),
                itemBuilder: (context, index) {
                  final date = quickDates[index];
                  final selected = _sameDay(date, _date);
                  return ChoiceChip(
                    selected: selected,
                    onSelected: (_) => setState(() => _date = date),
                    label: SizedBox(
                      width: 48 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, double.infinity),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(_weekday(date), style: theme.textTheme.labelSmall),
                          const SizedBox(height: 4),
                          Text('${date.day}', style: theme.textTheme.titleMedium),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _pickMoreDates,
                icon: const Icon(Icons.calendar_month_outlined, size: 18),
                label: Text(_isQuickDate(_date, quickDates) ? 'Choose another date' : _shortDate(_date)),
              ),
            ),
            const SizedBox(height: AaraagateTokens.space2),
            const PremiumSectionHeader(title: 'Choose time'),
            const SizedBox(height: AaraagateTokens.space2),
            PremiumSurface(
              onTap: _pickTime,
              semanticLabel: _time == null ? 'Select start time' : 'Selected start time ${_time!.format(context)}',
              padding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space3),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, color: scheme.primary),
                  const SizedBox(width: AaraagateTokens.space3),
                  Expanded(
                    child: Text(
                      _time == null ? 'Select start time' : _time!.format(context),
                      style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
                ],
              ),
            ),
            if (invalidPast) ...[
              const SizedBox(height: AaraagateTokens.space2),
              Text('Choose a future time.', style: theme.textTheme.bodySmall?.copyWith(color: scheme.error)),
            ],
            if(maxGuests>0) ...[
              const SizedBox(height:AaraagateTokens.space5),
              const PremiumSectionHeader(title:'Guests'),
              const SizedBox(height:AaraagateTokens.space2),
              PremiumSurface(
                semanticLabel:'Selected guest count $_guestCount of maximum $maxGuests',
                child:Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AaraagateTokens.space2,
                  runSpacing: AaraagateTokens.space2,
                  children:[
                  const Icon(Icons.group_outlined),
                  const SizedBox(width:AaraagateTokens.space3),
                  Text('Guests joining you',style:theme.textTheme.bodyLarge?.copyWith(fontWeight:FontWeight.w700)),
                  IconButton(
                    tooltip:'Remove guest',
                    onPressed:_guestCount>0?()=>setState(()=>_guestCount--):null,
                    icon:const Icon(Icons.remove_circle_outline),
                  ),
                  Text('$_guestCount',textAlign:TextAlign.center,style:theme.textTheme.titleMedium),
                  IconButton(
                    tooltip:'Add guest',
                    onPressed:_guestCount<maxGuests?()=>setState(()=>_guestCount++):null,
                    icon:const Icon(Icons.add_circle_outline),
                  ),
                ]),
              ),
              const SizedBox(height:AaraagateTokens.space1),
              Text('Only the number of guests is stored; guest names are not collected.',style:theme.textTheme.bodySmall?.copyWith(color:scheme.onSurfaceVariant)),
            ],
            if(noShowPolicy!=null) ...[
              const SizedBox(height:AaraagateTokens.space5),
              PremiumSurface(
                color:scheme.surfaceContainer,
                elevated:false,
                child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Icon(Icons.event_busy_outlined,color:scheme.primary),
                  const SizedBox(width:AaraagateTokens.space3),
                  Expanded(child:Text('Fair-use policy: $noShowPolicy. This never posts a fee or cancels an existing booking; it only pauses new booking/waitlist eligibility while the configured period is active.',style:theme.textTheme.bodySmall)),
                ]),
              ),
            ],
            const SizedBox(height: AaraagateTokens.space5),
            PremiumSurface(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(approval ? Icons.schedule_send_outlined : Icons.verified_user_outlined, color: scheme.primary),
                  const SizedBox(width: AaraagateTokens.space3),
                  Expanded(
                    child: Text(
                      approval
                          ? 'Your society will review this booking after you submit it.'
                          : 'Your selected time is only a request until the server confirms that capacity is still available.',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AaraagateTokens.space5),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: startsAt == null || invalidPast
                    ? null
                    : () => Navigator.pop(context, _BookingSelection(startsAt, _guestCount)),
                icon: const Icon(Icons.event_available_rounded),
                label: Text(approval ? 'Request booking' : 'Confirm booking'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AmenityCard extends StatelessWidget {
  const _AmenityCard({required this.amenity, required this.busy, required this.onBook});
  final Map<String, dynamic> amenity;
  final bool busy;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final approval = amenity['requiresApproval'] == true;
    final slotMinutes = _asInt(amenity['slotMinutes'], fallback: 60);
    final description = amenity['description']?.toString() ?? '';
    final rules=amenity['bookingRules'];
    final maxGuests=rules is Map?_asInt(rules['maxGuestsPerBooking'],fallback:0):0;
    final noShowPolicy=_amenityNoShowPolicyLabel(amenity);
    final blackout=_nextAmenityBlackout(amenity);
    final todayHours=_amenityHoursForIndiaDay(amenity,DateTime.now().toUtc().add(const Duration(hours:5,minutes:30)).weekday);

    return PremiumSurface(
      color: scheme.surface,
      elevated: false,
      padding: const EdgeInsets.all(AaraagateTokens.space5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PremiumIdentityHeader(
            icon: Icons.sports_tennis_rounded,
            title: amenity['name']?.toString() ?? 'Amenity',
            supportingText: amenity['location']?.toString(),
            status: AaraagateStatusPill(
              label: approval ? 'Approval required' : 'Instant booking',
              tone: approval ? AaraagateStatusTone.warning : AaraagateStatusTone.info,
            ),
          ),
          if (description.isNotEmpty) ...[
            const SizedBox(height: AaraagateTokens.space3),
            Text(description, style: theme.textTheme.bodyMedium?.copyWith(height: 1.45)),
          ],
          if(blackout!=null) ...[
            const SizedBox(height:AaraagateTokens.space3),
            PremiumSurface(
              color:scheme.surfaceContainer,
              elevated:false,
              child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Icon(Icons.construction_outlined,color:scheme.primary),
                const SizedBox(width:AaraagateTokens.space2),
                Expanded(child:Text('Upcoming ${(blackout['kind']??'MAINTENANCE').toString().replaceAll('_',' ').toLowerCase()}: ${_formatApiDate(blackout['start'])} to ${_formatApiDate(blackout['end'])}${blackout['reason']?.toString().trim().isNotEmpty==true?' · ${blackout['reason']}':''}',style:theme.textTheme.bodySmall)),
              ]),
            ),
          ],
          const SizedBox(height: AaraagateTokens.space3),
          Wrap(
            spacing:AaraagateTokens.space4,
            runSpacing:AaraagateTokens.space2,
            children: [
              _Meta(icon: Icons.schedule_outlined, label: '$slotMinutes min'),
              _Meta(icon: Icons.payments_outlined, label: _feeLabel(amenity['feePaise'])),
              _Meta(icon:Icons.group_outlined,label:maxGuests>0?'Up to $maxGuests guests':'No guests'),
              if(noShowPolicy!=null)_Meta(icon:Icons.event_busy_outlined,label:noShowPolicy),
              if(todayHours!=null)_Meta(icon:Icons.access_time_rounded,label:todayHours),
            ],
          ),
          const SizedBox(height: AaraagateTokens.space4),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: busy ? null : onBook,
              icon: const Icon(Icons.calendar_month_outlined),
              label: const Text('Choose date & time'),
            ),
          ),
        ],
      ),
    );
  }
}

class _WaitlistCard extends StatelessWidget {
  const _WaitlistCard({required this.entry,required this.busy,this.onCancel});
  final Map<String,dynamic> entry;
  final bool busy;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context){
    final status=entry['status']?.toString()??'WAITING';
    final position=_asInt(entry['position'],fallback:0);
    final guests=_asInt(entry['guestCount'],fallback:0);
    final guestLabel=guests>0?' · $guests guest${guests==1?'':'s'}':'';
    final detail=status=='WAITING'&&position>0
      ? 'Position $position · ${_formatApiDate(entry['startsAt'])}$guestLabel'
      : '${_titleCase(status.toLowerCase())} · ${_formatApiDate(entry['startsAt'])}$guestLabel';
    return PremiumSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PremiumIdentityHeader(
          icon: status == 'PROMOTED' ? Icons.event_available_rounded : Icons.hourglass_top…3449 tokens truncated…rderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
          ),
          child: Icon(icon, color: scheme.primary, size: 24),
        ),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrow != null) ...[
                Text(
                  eyebrow!,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                    letterSpacing: .2,
                  ),
                ),
                const SizedBox(height: AaraagateTokens.space1),
              ],
              Text(
                title,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: AaraagateTokens.space1),
              Text(
                supportingText,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    );

    if (action == null) return copy;

    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 420 || scale > 1.3;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              copy,
              const SizedBox(height: AaraagateTokens.space3),
              Align(alignment: Alignment.centerLeft, child: action!),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: AaraagateTokens.space3),
            action!,
          ],
        );
      },
    );
  }
}

/// Consistent section heading for scan-friendly resident screens.
/// Keeps headings quiet enough that the screen title remains dominant.
/// Use in a scrolling page: essential copy grows with the user's text setting.
class PremiumSectionHeader extends StatelessWidget {
  const PremiumSectionHeader({
    super.key,
    required this.title,
    this.supportingText,
    this.trailing,
  });

  final String title;
  final String? supportingText;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium,
        ),
        if (supportingText != null) ...[
          const SizedBox(height: AaraagateTokens.space1),
          Text(
            supportingText!,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
        ],
      ],
    );

    if (trailing == null) return copy;

    return LayoutBuilder(
      builder: (context, constraints) {
        final scale = MediaQuery.textScalerOf(context).scale(1);
        final stacked = constraints.maxWidth < 420 || scale > 1.3;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              copy,
              const SizedBox(height: AaraagateTokens.space2),
              Align(alignment: Alignment.centerLeft, child: trailing!),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: AaraagateTokens.space3),
            trailing!,
          ],
        );
      },
    );
  }
}

class PremiumQuickAction extends StatelessWidget {
  const PremiumQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: label,
      color: scheme.surfaceContainerLow,
      padding: const EdgeInsets.symmetric(
        horizontal: AaraagateTokens.space3,
        vertical: AaraagateTokens.space3,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 76),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: .10),
                borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
              ),
              child: Icon(icon, color: scheme.primary, size: 24),
            ),
            const SizedBox(width: AaraagateTokens.space3),
            Expanded(
              child: Text(
                label,
                style: theme.textTheme.labelLarge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AaraagateStatusPill extends StatelessWidget {
  const AaraagateStatusPill({super.key, required this.label, this.tone = AaraagateStatusTone.neutral});

  final String label;
  final AaraagateStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = switch (tone) {
      AaraagateStatusTone.info => (scheme.primaryContainer, scheme.onPrimaryContainer),
      AaraagateStatusTone.success => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      AaraagateStatusTone.warning => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      AaraagateStatusTone.danger => (scheme.errorContainer, scheme.onErrorContainer),
      AaraagateStatusTone.neutral => (scheme.surfaceContainerHigh, scheme.onSurfaceVariant),
    };
    return Semantics(
      label: 'Status: $label',
      excludeSemantics: true,
      child: AnimatedContainer(
        duration: AaraagateMotion.duration(context, AaraagateMotion.standard),
        curve: AaraagateMotion.emphasized,
        constraints: const BoxConstraints(minHeight: 28),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: colors.$1,
          borderRadius: BorderRadius.circular(AaraagateTokens.radiusPill),
        ),
        child: AnimatedSwitcher(
          duration: AaraagateMotion.duration(context, AaraagateMotion.quick),
          switchInCurve: AaraagateMotion.emphasized,
          switchOutCurve: AaraagateMotion.emphasized,
          child: Text(
            label,
            key: ValueKey(label),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: colors.$2,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

/// Identity stays readable while secondary status wraps below the copy.
/// Used for arrivals and facilities instead of competing trailing columns.
class PremiumIdentityHeader extends StatelessWidget {
  const PremiumIdentityHeader({
    super.key,
    required this.icon,
    required this.title,
    this.supportingText,
    this.status,
  });

  final IconData icon;
  final String title;
  final String? supportingText;
  final Widget? status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: AaraagateTokens.iconContainer,
          height: AaraagateTokens.iconContainer,
          decoration: BoxDecoration(
            color: scheme.primaryContainer,
            borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
          ),
          child: Icon(icon, color: scheme.onPrimaryContainer),
        ),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.titleMedium),
              if (supportingText != null && supportingText!.isNotEmpty) ...[
                const SizedBox(height: AaraagateTokens.space1),
                Text(supportingText!, style: theme.textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                )),
              ],
              if (status != null) ...[
                const SizedBox(height: AaraagateTokens.space2),
                status!,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Keeps primary and secondary actions usable at narrow widths or large type.
class PremiumActionGroup extends StatelessWidget {
  const PremiumActionGroup({super.key, required this.primary, this.secondary});
  final Widget primary;
  final Widget? secondary;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (secondary == null) return SizedBox(width: double.infinity, child: primary);
      if (constraints.maxWidth < 360 || MediaQuery.textScalerOf(context).scale(1) > 1.3) {
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          primary,
          const SizedBox(height: AaraagateTokens.space2),
          secondary!,
        ]);
      }
      return Row(children: [
        Expanded(child: secondary!),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(flex: 2, child: primary),
      ]);
    },
  );
}
