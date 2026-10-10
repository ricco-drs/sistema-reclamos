package pe.uni.fiis.prestamos;

import java.time.LocalDate;

/** Un préstamo de equipo. Sin separación: el mismo objeto guarda lo del
 *  negocio y lo que la base necesita para escribir la fila. */
public class Prestamo {
    public String id;
    public String codigoAlumno;
    public String equipo;
    public String motivo;
    public LocalDate fecha;
    public LocalDate devolucion;
    public boolean devuelto;
    public String filaCsv;

    public Prestamo(String id, String codigoAlumno, String equipo, String motivo, LocalDate fecha, LocalDate devolucion) {
        this.id = id;
        this.codigoAlumno = codigoAlumno;
        this.equipo = equipo;
        this.motivo = motivo;
        this.fecha = fecha;
        this.devolucion = devolucion;
        this.devuelto = false;
        this.filaCsv = id + ";" + codigoAlumno + ";" + equipo + ";" + fecha + ";" + devolucion + ";false;" + motivo;
    }
}
