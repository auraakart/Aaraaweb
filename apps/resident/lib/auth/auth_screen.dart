import 'package:flutter/material.dart';
import 'auth_repository.dart';
import 'resident_auth_controller.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.controller});
  final ResidentAuthController controller;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _phone = TextEditingController(text: '+91');
  final _otp = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final theme = Theme.of(context);
        return Scaffold(
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 76,
                          height: 76,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [theme.colorScheme.primary, theme.colorScheme.secondary],
                            ),
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: theme.colorScheme.primary.withOpacity(.18),
                                blurRadius: 28,
                                offset: const Offset(0, 12),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.shield_rounded, size: 38, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Text(
                        'Welcome to Aaraagate',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.4),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Secure access to your home and community.',
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
                              if (controller.step == ResidentAuthStep.loading)
                                const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 24),
                                  child: Center(child: CircularProgressIndicator()),
                                ),
                              if (controller.step == ResidentAuthStep.phone) _phoneStep(controller),
                              if (controller.step == ResidentAuthStep.otp) _otpStep(controller),
                              if (controller.step == ResidentAuthStep.society) _societyStep(controller),
                              if (controller.error != null) ...[
                                const SizedBox(height: 16),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.errorContainer,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    controller.error!,
                                    style: TextStyle(color: theme.colorScheme.onErrorContainer),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.lock_outline_rounded, size: 16, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 6),
                          Text(
                            'Society-scoped secure session',
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _phoneStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Sign in', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Text('Use the mobile number registered with your society.', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 18),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Mobile number', prefixIcon: Icon(Icons.phone_android_rounded), hintText: '+91 98765 43210'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: controller.busy ? null : () => controller.requestOtp(_phone.text),
          child: controller.busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Send OTP'),
        ),
        const SizedBox(height: 12),
        const Text('We’ll send a one-time password to verify your registered mobile number.', textAlign: TextAlign.center),
        if (controller.demoEnabled) ...[
          const SizedBox(height: 24),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('DEMO', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w800)),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: controller.busy ? null : controller.enterDemo,
            icon: const Icon(Icons.play_circle_outline_rounded),
            label: const Text('Continue as Demo Resident'),
          ),
          const SizedBox(height: 8),
          Text(
            'Explore the app with sample local data. No OTP or live backend is used.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }

  Widget _otpStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Verify mobile', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        const Text('Enter the 6-digit OTP sent to your registered number.'),
        const SizedBox(height: 18),
        TextField(
          controller: _otp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          decoration: const InputDecoration(labelText: '6-digit OTP', prefixIcon: Icon(Icons.lock_outline_rounded)),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: controller.busy ? null : () => controller.verifyOtp(_otp.text),
          child: controller.busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verify & continue'),
        ),
      ],
    );
  }

  Widget _societyStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Choose your society', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        const Text('Your session will be scoped to the selected society.'),
        const SizedBox(height: 16),
        for (final membership in controller.memberships)
          _SocietyTile(
            membership: membership,
            busy: controller.busy,
            onTap: () => controller.selectSociety(membership),
          ),
      ],
    );
  }
}

class _SocietyTile extends StatelessWidget {
  const _SocietyTile({required this.membership, required this.busy, required this.onTap});
  final SocietyMembershipOption membership;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: busy ? null : onTap,
        leading: CircleAvatar(
          backgroundColor: scheme.primaryContainer,
          foregroundColor: scheme.onPrimaryContainer,
          child: const Icon(Icons.apartment_rounded),
        ),
        title: Text(membership.name, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('${membership.code.isEmpty ? 'Community' : membership.code} · ${membership.role.replaceAll('_', ' ')}'),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
