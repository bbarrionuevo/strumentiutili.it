// js/storage-helper.js — Persistencia Local Universal y Automática (PWA)
(function () {
  'use strict';

  const AppStorage = {
    save(key, data) {
      try {
        localStorage.setItem(`su_${key}`, JSON.stringify(data));
      } catch (e) {
        console.warn('[Storage] Error al guardar localmente:', e);
      }
    },

    load(key, fallback = null) {
      try {
        const item = localStorage.getItem(`su_${key}`);
        return item ? JSON.parse(item) : fallback;
      } catch (e) {
        console.warn('[Storage] Error al cargar la clave:', key);
        return fallback;
      }
    }
  };

  // AUTO-INICIALIZACIÓN UNIVERSAL: Se ejecuta en todas las herramientas
  document.addEventListener('DOMContentLoaded', () => {
    // Genera una clave única basada en la URL (ej: "form_data__fisco_professioni_partita_iva_")
    const pageKey = location.pathname.replace(/[\/\.]/g, '_') || 'home';
    const storageKey = `form_data_${pageKey}`;

    // Busca los contenedores de entradas en la página
    const containers = document.querySelectorAll('form, main');
    if (!containers.length) return;

    const savedData = AppStorage.load(storageKey, {});

    containers.forEach(container => {
      const inputs = container.querySelectorAll('input, select, textarea');

      // 1. Restaurar valores previos
      inputs.forEach(input => {
        const fieldKey = input.id || input.name;
        // Ignorar botones, archivos o contraseñas
        if (!fieldKey || input.type === 'file' || input.type === 'password' || input.type === 'submit' || input.type === 'button') return;

        if (savedData[fieldKey] !== undefined) {
          if (input.type === 'checkbox') {
            input.checked = Boolean(savedData[fieldKey]);
          } else if (input.type === 'radio') {
            input.checked = (input.value === savedData[fieldKey]);
          } else {
            input.value = savedData[fieldKey];
          }

          // Notificar a las calculadoras reactivas para que actualicen sus cuentas
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // 2. Escuchar cambios en tiempo real y guardar automáticamente
      container.addEventListener('input', (e) => {
        const target = e.target;
        const fieldKey = target.id || target.name;
        if (!fieldKey || target.type === 'file' || target.type === 'password') return;

        if (target.type === 'checkbox') {
          savedData[fieldKey] = target.checked;
        } else if (target.type === 'radio') {
          if (target.checked) savedData[fieldKey] = target.value;
        } else {
          savedData[fieldKey] = target.value;
        }

        AppStorage.save(storageKey, savedData);
      });
    });
  });

  window.AppStorage = AppStorage;
})();