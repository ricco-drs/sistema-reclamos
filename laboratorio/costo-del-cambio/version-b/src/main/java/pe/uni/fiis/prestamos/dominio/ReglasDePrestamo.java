package pe.uni.fiis.prestamos.dominio;

import java.util.List;

/** Las reglas del préstamo, en un solo lugar. Cualquier forma de prestar
 *  pasa por acá, así que una regla nueva se escribe una sola vez. */
public final class ReglasDePrestamo {

    private ReglasDePrestamo() {
    }

    public static void validar(String codigoAlumno, String equipo, String motivo, List<Prestamo> yaRegistrados) {
        if (codigoAlumno == null || codigoAlumno.isBlank()) {
            throw new IllegalArgumentException("El código del alumno es obligatorio");
        }
        if (equipo == null || equipo.isBlank()) {
            throw new IllegalArgumentException("El equipo es obligatorio");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new IllegalArgumentException("El motivo del préstamo es obligatorio");
        }
        long pendientes = yaRegistrados.stream()
                .filter(p -> p.codigoAlumno().equals(codigoAlumno) && p.sigueAfuera()).count();
        if (pendientes >= 2) {
            throw new IllegalStateException("El alumno ya tiene dos equipos sin devolver");
        }
        boolean ocupado = yaRegistrados.stream().anyMatch(p -> p.esDelEquipo(equipo) && p.sigueAfuera());
        if (ocupado) {
            throw new IllegalStateException("El equipo ya está prestado: " + equipo);
        }
    }
}
