### 🧪 Documentación de Testing y QA - OKY (Dromos)
Este documento detalla el proceso de validación, control de calidad y estado del Producto Mínimo Viable (MVP) de la plataforma **OKY** (Plataforma web de gestión y coordinación de pasantías escolares en Alta Gracia).

---

#### 🤝 Metodología de Testing y Estado del MVP
Para verificar la estabilidad y usabilidad de la plataforma, se realizaron pruebas funcionales sobre los flujos críticos del sistema.

*   **Equipo auditor:** Proyecto *"Elección de pasantías:"* 
*   **Auditores:** Lourdes Alurralde, Ana Nogueira y Victoria González Depetris.
*   **Estado General del MVP:** ~75% de desarrollo completado.
*   **Metodología:** Ejecución de pruebas manuales de caja negra sobre los flujos clave de navegación de Estudiantes, Empresas e Instituciones Educativas.

---

## 📸 Evidencia del Proceso (Planilla Combinada)

- [Planilla Combinada](./Planilla%20Combinada%20Testing%20AllWays.xlsx)

---

#### 📋 Lista de Pruebas Manuales Realizadas
Se verificaron los siguientes módulos y flujos dentro de la versión actual del sistema:

##### Autenticación y Gestión de Perfiles
*  Registro e inicio de sesión de usuarios.
*  Creación de distintos tipos de perfiles según el rol de usuario (Estudiantes, Empresas, Escuelas).
*  Validación del correo electrónico corporativo para empresas (excluyendo dominios de correo personal como @gmail, @hotmail o @yahoo) para garantizar la fiabilidad del perfil corporativo.

##### Administración de Pasantías (Empresas y Administradores)
*  Publicación de nuevas ofertas de pasantías.
*  Verificación de permisos para la edición de pasantías previamente publicadas.
*  Módulo de administración de pasantías activas para empresas.

##### Funcionalidades de Usuario Final (Estudiantes e Instituciones)
*  Visualización del catálogo de ofertas de pasantías disponibles.
*  Guardado de propuestas de pasantía para consulta posterior ("Guardar para ver después").
*  Recepción de avisos en el sistema básico de notificaciones.

##### Validación de Seguridad y Normativa Legal
*  Verificación de requisitos de registro (cuenta activa y mail corporativo).
*  Mecanismo de solicitud de documentación legal adicional (comprobantes de registro o autenticación por correo) en caso de denuncias o sospechas de suplantación de identidad.

---

#### 🐛 Estado de Funcionalidades, Bugs e Implementaciones Pendientes
Durante las pruebas del MVP se consolidaron las funciones terminadas y los puntos que requieren desarrollo previo al lanzamiento final:

##### 1. Carga de Archivos Multimediales
*   **Estado:** Pendiente.
*   **Detalle:** El sistema actual no permite adjuntar imágenes en las publicaciones o perfiles.
*   **Solución planteada:** Integración del almacenamiento en la nube para habilitar la carga de archivos de imagen.

##### 2. Sistema de Filtros en la Búsqueda
*   **Estado:** Pendiente.
*   **Detalle:** Falta implementar un sistema de filtrado avanzado para que los estudiantes encuentren ofertas según especialidad o área de interés.
*   **Solución planteada:** Incorporar consultas estructuradas en la base de datos para filtrar por categorías específicas.

##### 3. Contador y Medición del Tiempo de Pasantías
*   **Estado:** Pendiente / Refactorización.
*   **Detalle:** Se requiere un cálculo y seguimiento automático de la duración y cronograma de las pasantías.
*   **Solución planteada:** Ajuste en la lógica de gestión de fechas para el conteo preciso de los períodos de pasantía.

---

#### 🧾 Autor
Equipo **OKY / Dromos**
equipo  **Kordian** - Proyecto Final Integrador (2026)