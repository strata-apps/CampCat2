// screens/signin.js
import supabase from '../supabaseClient.js';

export default function SignIn(root) {
  root.innerHTML = `
    <section class="page-head" style="margin-top: 40px;"><h1 class="page-title">ReachPoint</h1></section>
    <div class="card" style="grid-column:span 12; max-width:420px; margin:0 auto;">
      <label class="label">Email</label>
      <input id="rp-email" type="email" placeholder="you@example.com"
             style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,.12);margin-bottom:10px;">
      <label class="label">Password</label>
      <input id="rp-pass" type="password" placeholder="••••••••"
             style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,.12);margin-bottom:14px;">
      <div style="display:flex; gap:8px;">
        <button id="rp-login" class="btn-add">Sign in</button>
        <button id="rp-signup" class="btn">Create account</button>
      </div>
      <p class="label" id="rp-msg" style="margin-top:10px;"></p>
    </div>
  `;

  const emailEl = root.querySelector('#rp-email');
  const passEl  = root.querySelector('#rp-pass');
  const msgEl   = root.querySelector('#rp-msg');

  root.querySelector('#rp-login')?.addEventListener('click', async () => {
    msgEl.textContent = 'Signing in...';
    const { error } = await supabase.auth.signInWithPassword({
      email: emailEl.value.trim(),
      password: passEl.value,
    });
    if (error) { msgEl.textContent = error.message; return; }
    location.hash = '#/dashboard';
  });

  root.querySelector('#rp-signup')?.addEventListener('click', async () => {
    msgEl.textContent = 'Creating account...';
    const { error } = await supabase.auth.signUp({
      email: emailEl.value.trim(),
      password: passEl.value,
    });
    if (error) { msgEl.textContent = error.message; return; }
    msgEl.textContent = 'Check your email to confirm your account, then sign in.';
  });
}
