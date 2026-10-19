package pe.uni.fiis.prestamos;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Todo junto: valida, arma el objeto, escribe en la base y arma la
 *  respuesta. Las reglas están escritas dos veces, una por cada forma de
 *  prestar, porque así fue creciendo el código. */
public class PrestamoService {

    private final BaseDeDatos base;

    public PrestamoService(BaseDeDatos base) {
        this.base = base;
    }

    public String prestar(String codigoAlumno, String equipo, String motivo, LocalDate hoy) {
        if (codigoAlumno == null || codigoAlumno.isBlank()) {
            throw new IllegalArgumentException("El código del alumno es obligatorio");
        }
        if (equipo == null || equipo.isBlank()) {
            throw new IllegalArgumentException("El equipo es obligatorio");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new IllegalArgumentException("El motivo del préstamo es obligatorio");
        }
        long pendientes = base.porAlumno(codigoAlumno).stream().filter(p -> !p.devuelto).count();
        if (pendientes >= 2) {
            throw new IllegalStateException("El alumno ya tiene dos equipos sin devolver");
        }
        for (Prestamo p : base.todos()) {
            if (p.equipo.equals(equipo) && !p.devuelto) {
                throw new IllegalStateException("El equipo ya está prestado: " + equipo);
            }
        }
        Prestamo nuevo = new Prestamo(UUID.randomUUID().toString(), codigoAlumno, equipo, motivo, hoy, hoy.plusDays(7));
        base.insertar(nuevo);
        return nuevo.id;
    }

    /** El préstamo urgente lo autoriza el jefe de laboratorio y dura un día.
     *  Repite las mismas validaciones que prestar(). */
    public String prestarUrgente(String codigoAlumno, String equipo, String autoriza, String motivo, LocalDate hoy) {
        if (codigoAlumno == null || codigoAlumno.isBlank()) {
            throw new IllegalArgumentException("El código del alumno es obligatorio");
        }
        if (equipo == null || equipo.isBlank()) {
            throw new IllegalArgumentException("El equipo es obligatorio");
        }
        if (autoriza == null || autoriza.isBlank()) {
            throw new IllegalArgumentException("Falta quién autoriza");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new IllegalArgumentException("El motivo del préstamo es obligatorio");
        }
        long pendientes = base.porAlumno(codigoAlumno).stream().filter(p -> !p.devuelto).count();
        if (pendientes >= 2) {
            throw new IllegalStateException("El alumno ya tiene dos equipos sin devolver");
        }
        for (Prestamo p : base.todos()) {
            if (p.equipo.equals(equipo) && !p.devuelto) {
                throw new IllegalStateException("El equipo ya está prestado: " + equipo);
            }
        }
        Prestamo nuevo = new Prestamo(UUID.randomUUID().toString(), codigoAlumno, equipo, motivo, hoy, hoy.plusDays(1));
        base.insertar(nuevo);
        return nuevo.id;
    }

    public void devolver(String idPrestamo) {
        Prestamo p = base.porId(idPrestamo);
        if (p == null) throw new IllegalArgumentException("No existe el préstamo " + idPrestamo);
        p.devuelto = true;
        p.filaCsv = p.id + ";" + p.codigoAlumno + ";" + p.equipo + ";" + p.fecha + ";" + p.devolucion + ";true;" + p.motivo;
    }

    public List<Prestamo> prestamosDe(String codigoAlumno) {
        return base.porAlumno(codigoAlumno);
    }
}
