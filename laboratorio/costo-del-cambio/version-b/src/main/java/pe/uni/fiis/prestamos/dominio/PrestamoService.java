package pe.uni.fiis.prestamos.dominio;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** El caso de uso. Depende de la interfaz, nunca de una base concreta. */
public class PrestamoService {

    private final RepositorioDePrestamos repositorio;

    public PrestamoService(RepositorioDePrestamos repositorio) {
        this.repositorio = repositorio;
    }

    public String prestar(String codigoAlumno, String equipo, String motivo, LocalDate hoy) {
        return registrar(codigoAlumno, equipo, motivo, hoy, hoy.plusDays(7));
    }

    /** El préstamo urgente dura un día y necesita quién lo autoriza. */
    public String prestarUrgente(String codigoAlumno, String equipo, String autoriza, String motivo, LocalDate hoy) {
        if (autoriza == null || autoriza.isBlank()) {
            throw new IllegalArgumentException("Falta quién autoriza");
        }
        return registrar(codigoAlumno, equipo, motivo, hoy, hoy.plusDays(1));
    }

    private String registrar(String codigoAlumno, String equipo, String motivo, LocalDate fecha, LocalDate devolucion) {
        ReglasDePrestamo.validar(codigoAlumno, equipo, motivo, repositorio.todos());
        Prestamo nuevo = new Prestamo(UUID.randomUUID().toString(), codigoAlumno, equipo, motivo, fecha, devolucion, false);
        repositorio.guardar(nuevo);
        return nuevo.id();
    }

    public void devolver(String idPrestamo) {
        Prestamo p = repositorio.porId(idPrestamo);
        if (p == null) {
            throw new IllegalArgumentException("No existe el préstamo " + idPrestamo);
        }
        repositorio.guardar(p.devolver());
    }

    public List<Prestamo> prestamosDe(String codigoAlumno) {
        return repositorio.deAlumno(codigoAlumno);
    }
}
