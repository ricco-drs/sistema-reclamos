package pe.uni.fiis.prestamos;

import java.util.ArrayList;
import java.util.List;

/** La "base de datos". Es una lista en memoria, pero se usa como una base
 *  concreta: el resto del código la llama directo, por su nombre. */
public class BaseDeDatos {
    private final List<Prestamo> filas = new ArrayList<>();

    public void insertar(Prestamo p) {
        filas.add(p);
    }

    public List<Prestamo> todos() {
        return filas;
    }

    public List<Prestamo> porAlumno(String codigoAlumno) {
        List<Prestamo> r = new ArrayList<>();
        for (Prestamo p : filas) {
            if (p.codigoAlumno.equals(codigoAlumno)) r.add(p);
        }
        return r;
    }

    public Prestamo porId(String id) {
        for (Prestamo p : filas) {
            if (p.id.equals(id)) return p;
        }
        return null;
    }
}
