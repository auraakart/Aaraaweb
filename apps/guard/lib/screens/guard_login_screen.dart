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
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
              children: [
                Center(
                  child: Container(
                    width: 82,
                    height: 82,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [theme.colorScheme.primary, theme.colorScheme.secondary],
                      ),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: theme.colorScheme.primary.withOpacity(.2),
                          blurRadius: 28,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: const Icon(Icons.shield_rounded, size: 44, color: Colors.white),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Security shift',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.5),
                ),
                const SizedBox(height: 6),
                Text(
                  'Aaraagate Guard',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 28),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (c.needsSocietySelection) ...[
                          Text('Choose society', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 6),
                          const Text('Select the society for this security shift.'),
                          const SizedBox(height: 16),
                          for (final membership in c.memberships)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: FilledButton.tonal(
                                onPressed: c.busy ? null : () => c.selectSociety(membership['societyId'].toString()),
                                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(60)),
                                child: Text(_societyLabel(membership), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                              ),
                            ),
                        ] else ...[
                          Text('Guard sign in', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 6),
                          const Text('Use your registered security-staff mobile number.'),
                          const SizedBox(height: 18),
                          TextField(
                            controller: phone,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined)),
                          ),
                          const SizedBox(height: 14),
                          FilledButton(
                            onPressed: c.busy ? null : () => c.requestOtp(phone.text),
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
                ),
                const SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.verified_user_outlined, size: 17, color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: 6),
                    Text(
                      'Secure society-scoped access',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ],
            ),
          ),
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
