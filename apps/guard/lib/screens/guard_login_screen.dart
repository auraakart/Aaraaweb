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
    final scheme = theme.colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
              children: [
                Center(
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(Icons.shield_rounded, size: 40, color: scheme.onPrimaryContainer),
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
                  c.needsSocietySelection ? 'Choose the society you are assigned to today.' : 'Sign in with your registered security-staff mobile number.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant, height: 1.4),
                ),
                const SizedBox(height: 28),
                Material(
                  color: scheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(24),
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (c.needsSocietySelection) ...[
                          Text('Choose society', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 6),
                          Text('Your access remains limited to the selected society.', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                          const SizedBox(height: 18),
                          for (final membership in c.memberships)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: FilledButton.tonalIcon(
                                onPressed: c.busy ? null : () => c.selectSociety(membership['societyId'].toString()),
                                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(60)),
                                icon: const Icon(Icons.apartment_rounded),
                                label: Text(_societyLabel(membership), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                              ),
                            ),
                        ] else ...[
                          Text('Guard sign in', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 18),
                          TextField(
                            controller: phone,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.done,
                            autofillHints: const [AutofillHints.telephoneNumber],
                            decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_outlined)),
                            onSubmitted: c.busy ? null : (_) => c.requestOtp(phone.text),
                          ),
                          const SizedBox(height: 14),
                          FilledButton.icon(
                            onPressed: c.busy ? null : () => c.requestOtp(phone.text),
                            icon: const Icon(Icons.sms_outlined),
                            label: Text(c.challengeId == null ? 'GET OTP' : 'RESEND OTP', style: const TextStyle(fontWeight: FontWeight.w900)),
                          ),
                          if (c.challengeId != null) ...[
                            const SizedBox(height: 22),
                            Text('Enter verification code', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 10),
                            TextField(
                              controller: otp,
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.done,
                              autofillHints: const [AutofillHints.oneTimeCode],
                              maxLength: 6,
                              decoration: const InputDecoration(labelText: '6-digit OTP', prefixIcon: Icon(Icons.password_rounded), counterText: ''),
                              onSubmitted: c.busy ? null : (_) => c.verifyOtp(otp.text),
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
                Semantics(
                  label: 'Secure society-scoped access',
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.verified_user_outlined, size: 17, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 6),
                      Text('Secure society-scoped access', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
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
