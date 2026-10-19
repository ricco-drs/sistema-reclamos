package pe.uni.fiis.prestamos.dominio;

import java.time.LocalDate;

/** Un préstamo, en el lenguaje del laboratorio. No sabe cómo se guarda. */
public record Prestamo(String id, String codigoAlumno, String equipo, String motivo,
                       LocalDate fecha, LocalDate devolucion, boolean devuelto) {

    public Prestamo devolver() {
        return new Prestamo(id, codigoAlumno, equipo, motivo, fecha, devolucion, true);
    }

    public boolean esDelEquipo(String otroEquipo) {
        return equipo.equals(otroEquipo);
    }

    public boolean sigueAfuera() {
        return !devuelto;
    }
}
