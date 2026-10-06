// Verificação de sessão na interface; a API valida o JWT em cada rota protegida.
(async () => {
  const token = sessionStorage.getItem('techcampus_token');
  const redirect = () => { sessionStorage.removeItem('techcampus_token'); sessionStorage.removeItem('techcampus_usuario'); location.replace('/frontend/login.html'); };
  if (!token) return redirect();
  try {
    const response = await fetch('/api/perfil', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return redirect();
    const user = await response.json();
    sessionStorage.setItem('techcampus_usuario', JSON.stringify(user));
    document.querySelectorAll('a').forEach(a => {
      if (a.textContent.trim() === 'Sair') a.addEventListener('click', e => {
        e.preventDefault(); sessionStorage.removeItem('techcampus_token');
        sessionStorage.removeItem('techcampus_usuario'); location.replace('/landing/index.html');
      });
    });
    document.body.style.visibility = 'visible';
  } catch { redirect(); }
})();
