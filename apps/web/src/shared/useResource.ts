import { useEffect, useState } from "react";
import { message } from "./errors";
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(undefined);
    setError("");
    load()
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(message(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load, revision]);
  return { data, error, loading, reload: () => setRevision((x) => x + 1) };
}
