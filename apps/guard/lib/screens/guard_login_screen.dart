import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../widgets/guard_state_card.dart';

class GuardLoginScreen extends StatefulWidget {
  const GuardLoginScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardLoginScreen> createState() => _GuardLoginScreenState();
}

class _GuardLoginScreenState extends State<GuardLoginScreen> {
  final phone = TextEditingController(text: '+91');
  final otp = TextEditingController();

  @override
  void dispose() {
    phone.dispose();
    otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 30),
            CircleAvatar(
              radius: 38,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: const Icon(Icons.shield_rounded, size: 40),
            ),
            const SizedBox(height: 18),
            Text('Security shift', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Guard login', textAlign: TextAlign.center),
            const SizedBox(height: 30),
            if (c.needsSocietySelection) ...[
              Text('Choose society', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              for (final membership in c.memberships)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: FilledButton.tonal(
                    onPressed: c.busy ? null : () => c.selectSociety(membership['societyId'].toString()),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(58)),
                    child: Text(_societyLabel(membership), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  ),
                ),
            ] else ...[
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined)),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: c.busy ? null : () => c.requestOtp(phone.text),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                child: Text(c.challengeId == null ? 'GET OTP' : 'RESEND OTP', style: const TextStyle(fontWeight: FontWeight.w900)),
              ),
              if (c.challengeId != null) ...[
                const SizedBox(height: 20),
                TextField(
                  controller: otp,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(labelText: '6-digit OTP', prefixIcon: Icon(Icons.password_rounded), counterText: ''),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: c.busy ? null : () => c.verifyOtp(otp.text),
                  icon: const Icon(Icons.login_rounded),
                  label: const Text('START SHIFT', style: TextStyle(fontWeight: FontWeight.w900)),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(60)),
                ),
              ],
            ],
            if (c.busy) ...[
              const SizedBox(height: 18),
              const GuardStateCard(icon: Icons.sync_rounded, message: 'Working securely…', loading: true),
            ],
            if (c.error != null) ...[
              const SizedBox(height: 16),
              GuardStateCard(icon: Icons.error_outline_rounded, message: c.error!, error: true),
            ],
          ],
        ),
      ),
    );
  }

  String _societyLabel(Map<String, dynamic> membership) {
    final society = membership['society'];
    if (society is Map) return society['name']?.toString() ?? society['code']?.toString() ?? membership['societyId'].toString();
    return membership['societyId'].toString();
  }
}
