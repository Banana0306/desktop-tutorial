const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
});
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = document.getElementById('navbar').offsetHeight;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  });
});

const observer = new IntersectionObserver(
  entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }),
  { threshold: 0.12 }
);
document.querySelectorAll('.fade-in').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 0.1}s`;
  observer.observe(el);
});

const form = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');
function showError(fId, eId, msg) {
  document.getElementById(fId).style.borderColor = '#ff6b6b';
  document.getElementById(eId).textContent = msg;
  return false;
}
function clearError(fId, eId) {
  document.getElementById(fId).style.borderColor = '';
  document.getElementById(eId).textContent = '';
}
form.addEventListener('submit', e => {
  e.preventDefault();
  let valid = true;
  const name = document.getElementById('name').value.trim();
  const ci   = document.getElementById('contact-info').value.trim();
  const msg  = document.getElementById('message').value.trim();
  ['name','contact-info','message'].forEach((f,i) => clearError(f, ['nameError','contactError','messageError'][i]));
  if (!name) valid = showError('name','nameError','請輸入姓名或公司名稱');
  if (!ci)   valid = showError('contact-info','contactError','請輸入聯絡電話或 Email') && valid;
  else if (!ci.match(/^[\d\-\+\(\)\s]{7,}$/) && !ci.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
    valid = showError('contact-info','contactError','請輸入有效的電話或 Email 格式') && valid;
  if (!msg)  valid = showError('message','messageError','請輸入詢問內容') && valid;
  if (valid) { form.style.display = 'none'; formSuccess.style.display = 'block'; }
});